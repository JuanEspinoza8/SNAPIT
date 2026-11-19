import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/red/interceptor_sesion.dart';
import '../../compartido/sesion/sesion.dart';

// Lo social del feed: publicaciones, me gusta y comentarios (docs/api.md,
// sección «Social»).

/// El largo máximo de un comentario.
const maximoComentario = 1000;

/// Quién reportó o comentó, sin nada que lo identifique: dentro de cada
/// incidente es «Vecino N», numerado por orden de llegada (docs/api.md,
/// sección «Social»). SnapIt también comenta (al publicar un reporte y al
/// resolverse el problema): va con su nombre, sin número y con [sistema].
class Autor {
  const Autor({
    required this.numero,
    required this.nombre,
    this.sistema = false,
  });

  factory Autor.desdeJson(Map<String, dynamic> json) => Autor(
    numero: json['numero'] as int?,
    nombre: json['nombre'] as String,
    sistema: json['sistema'] as bool? ?? false,
  );

  /// Null para SnapIt.
  final int? numero;

  /// «Vecino 2» o «SnapIt».
  final String nombre;
  final bool sistema;
}

/// Un reporte de un vecino: una publicación.
class ReportePublico {
  const ReportePublico({
    required this.id,
    required this.incidenteId,
    required this.descripcion,
    required this.creadoEn,
    required this.autor,
    required this.fotoIds,
    required this.cantidadMeGusta,
    required this.cantidadComentarios,
    this.yaMeGusta = false,
  });

  factory ReportePublico.desdeJson(Map<String, dynamic> json) => ReportePublico(
    id: json['id'] as int,
    incidenteId: json['incidenteId'] as int,
    descripcion: json['descripcion'] as String?,
    creadoEn: DateTime.parse(json['creadoEn'] as String),
    autor: Autor.desdeJson(json['autor'] as Map<String, dynamic>),
    fotoIds: [
      for (final foto in json['fotos'] as List) (foto as Map)['id'] as int,
    ],
    cantidadMeGusta: json['cantidadMeGusta'] as int,
    cantidadComentarios: json['cantidadComentarios'] as int,
    yaMeGusta: json['yaMeGusta'] as bool? ?? false,
  );

  final int id;
  final int incidenteId;
  final String? descripcion;
  final DateTime creadoEn;
  final Autor autor;
  final List<int> fotoIds;
  final int cantidadMeGusta;
  final int cantidadComentarios;

  /// Si quien mira ya le dio me gusta. Sin sesión, false.
  final bool yaMeGusta;
}

class Comentario {
  const Comentario({
    required this.id,
    required this.texto,
    required this.creadoEn,
    required this.editado,
    required this.autor,
    this.esMio = false,
  });

  factory Comentario.desdeJson(Map<String, dynamic> json) => Comentario(
    id: json['id'] as int,
    texto: json['texto'] as String,
    creadoEn: DateTime.parse(json['creadoEn'] as String),
    editado: json['editadoEn'] != null,
    autor: Autor.desdeJson(json['autor'] as Map<String, dynamic>),
    esMio: json['esMio'] as bool? ?? false,
  );

  final int id;
  final String texto;
  final DateTime creadoEn;
  final bool editado;
  final Autor autor;

  /// Si lo escribió quien mira: lo puede editar o eliminar.
  final bool esMio;
}

/// Si hay sesión: las lecturas la mandan, así dicen si ya le diste me gusta
/// y qué comentarios son tuyos. Al ingresar o salir se vuelven a pedir.
final _conSesionProvider = Provider<bool>(
  (ref) => ref.watch(sesionProvider.select((s) => s.value != null)),
);

final repositorioSocialProvider = Provider<RepositorioSocial>(
  (ref) => RepositorioSocial(ref.watch(clienteApiProvider)),
);

final reportesDeIncidenteProvider = FutureProvider.autoDispose
    .family<List<ReportePublico>, int>(
      (ref, id) => ref
          .watch(repositorioSocialProvider)
          .reportesDeIncidente(id, conSesion: ref.watch(_conSesionProvider)),
    );

final reporteProvider = FutureProvider.autoDispose.family<ReportePublico, int>(
  (ref, id) => ref
      .watch(repositorioSocialProvider)
      .reporte(id, conSesion: ref.watch(_conSesionProvider)),
);

final comentariosDeReporteProvider = FutureProvider.autoDispose
    .family<List<Comentario>, int>(
      (ref, id) => ref
          .watch(repositorioSocialProvider)
          .comentariosDeReporte(id, conSesion: ref.watch(_conSesionProvider)),
    );

/// Van bajo `/social` para no chocar con las del operador. Leer es público:
/// sin sesión va sin token, como el mapa, para que uno vencido no dispare una
/// renovación. Dar me gusta y comentar necesita la sesión de un vecino.
class RepositorioSocial {
  RepositorioSocial(this._dio);

  final Dio _dio;

  Future<List<ReportePublico>> reportesDeIncidente(
    int id, {
    bool conSesion = false,
  }) => _lista(
    '/social/incidentes/$id/reportes',
    'reportes',
    ReportePublico.desdeJson,
    conSesion,
  );

  Future<List<Comentario>> comentariosDeReporte(
    int id, {
    bool conSesion = false,
  }) => _lista(
    '/social/reportes/$id/comentarios',
    'comentarios',
    Comentario.desdeJson,
    conSesion,
  );

  Future<ReportePublico> reporte(int id, {bool conSesion = false}) async =>
      ReportePublico.desdeJson(
        await _pedir('GET', '/social/reportes/$id', conSesion: conSesion),
      );

  /// Da o quita el me gusta. Devuelve el contador nuevo.
  Future<int> meGusta(int reporteId, {required bool dar}) async {
    final datos = await _pedir(
      dar ? 'POST' : 'DELETE',
      '/social/reportes/$reporteId/me-gusta',
    );
    return datos['cantidadMeGusta'] as int;
  }

  Future<Comentario> comentar(int reporteId, String texto) async =>
      Comentario.desdeJson(
        await _pedir(
          'POST',
          '/social/reportes/$reporteId/comentarios',
          datos: {'texto': texto},
        ),
      );

  Future<Comentario> editarComentario(int id, String texto) async =>
      Comentario.desdeJson(
        await _pedir(
          'PATCH',
          '/social/comentarios/$id',
          datos: {'texto': texto},
        ),
      );

  Future<void> eliminarComentario(int id) =>
      _pedir('DELETE', '/social/comentarios/$id');

  Future<List<T>> _lista<T>(
    String ruta,
    String clave,
    T Function(Map<String, dynamic>) convertir,
    bool conSesion,
  ) async {
    final datos = await _pedir('GET', ruta, conSesion: conSesion);
    return [
      for (final item in datos[clave] as List)
        convertir(item as Map<String, dynamic>),
    ];
  }

  Future<Map<String, dynamic>> _pedir(
    String metodo,
    String ruta, {
    bool conSesion = true,
    Object? datos,
  }) async {
    try {
      final respuesta = await _dio.request<Map<String, dynamic>>(
        ruta,
        data: datos,
        options: Options(
          method: metodo,
          extra: {InterceptorSesion.sinSesion: !conSesion},
        ),
      );
      // 204 (eliminar un comentario) no trae cuerpo.
      return respuesta.data ?? const {};
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
