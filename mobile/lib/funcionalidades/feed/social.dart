import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/red/interceptor_sesion.dart';

// Lo social del feed, de solo lectura por ahora (docs/api.md, sección «Social»).

class Autor {
  const Autor({required this.id, required this.nombre});

  factory Autor.desdeJson(Map<String, dynamic> json) =>
      Autor(id: json['id'] as int, nombre: json['nombre'] as String);

  final int id;
  final String nombre;

  /// La inicial para el círculo que hace de foto de perfil.
  String get inicial {
    final limpio = nombre.trim();
    return limpio.isEmpty ? '?' : limpio[0].toUpperCase();
  }
}

/// Un reporte de un vecino, como se ve en el detalle del incidente.
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
  );

  final int id;
  final int incidenteId;
  final String? descripcion;
  final DateTime creadoEn;
  final Autor autor;
  final List<int> fotoIds;
  final int cantidadMeGusta;
  final int cantidadComentarios;
}

class Comentario {
  const Comentario({
    required this.id,
    required this.texto,
    required this.creadoEn,
    required this.editado,
    required this.autor,
  });

  factory Comentario.desdeJson(Map<String, dynamic> json) => Comentario(
    id: json['id'] as int,
    texto: json['texto'] as String,
    creadoEn: DateTime.parse(json['creadoEn'] as String),
    editado: json['editadoEn'] != null,
    autor: Autor.desdeJson(json['autor'] as Map<String, dynamic>),
  );

  final int id;
  final String texto;
  final DateTime creadoEn;
  final bool editado;
  final Autor autor;
}

final repositorioSocialProvider = Provider<RepositorioSocial>(
  (ref) => RepositorioSocial(ref.watch(clienteApiProvider)),
);

final reportesDeIncidenteProvider = FutureProvider.autoDispose
    .family<List<ReportePublico>, int>(
      (ref, id) => ref.watch(repositorioSocialProvider).reportesDeIncidente(id),
    );

final comentariosDeIncidenteProvider = FutureProvider.autoDispose
    .family<List<Comentario>, int>(
      (ref, id) =>
          ref.watch(repositorioSocialProvider).comentariosDeIncidente(id),
    );

final reporteProvider = FutureProvider.autoDispose.family<ReportePublico, int>(
  (ref, id) => ref.watch(repositorioSocialProvider).reporte(id),
);

final comentariosDeReporteProvider = FutureProvider.autoDispose
    .family<List<Comentario>, int>(
      (ref, id) =>
          ref.watch(repositorioSocialProvider).comentariosDeReporte(id),
    );

/// Rutas públicas, sin sesión: igual que el mapa y el feed.
class RepositorioSocial {
  RepositorioSocial(this._dio);

  final Dio _dio;

  Future<List<ReportePublico>> reportesDeIncidente(int id) =>
      _lista('/incidentes/$id/reportes', 'reportes', ReportePublico.desdeJson);

  Future<List<Comentario>> comentariosDeIncidente(int id) => _lista(
    '/incidentes/$id/comentarios',
    'comentarios',
    Comentario.desdeJson,
  );

  Future<List<Comentario>> comentariosDeReporte(int id) =>
      _lista('/reportes/$id/comentarios', 'comentarios', Comentario.desdeJson);

  Future<ReportePublico> reporte(int id) async {
    final datos = await _pedir('/reportes/$id/publico');
    return ReportePublico.desdeJson(datos);
  }

  Future<List<T>> _lista<T>(
    String ruta,
    String clave,
    T Function(Map<String, dynamic>) convertir,
  ) async {
    final datos = await _pedir(ruta);
    return [
      for (final item in datos[clave] as List)
        convertir(item as Map<String, dynamic>),
    ];
  }

  Future<Map<String, dynamic>> _pedir(String ruta) async {
    try {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        ruta,
        options: Options(extra: {InterceptorSesion.sinSesion: true}),
      );
      return respuesta.data!;
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
