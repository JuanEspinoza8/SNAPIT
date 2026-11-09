import 'package:dio/dio.dart';
import 'package:latlong2/latlong.dart';

import 'app_de_prueba.dart';
import 'recorrido.dart';
import 'servidor_falso.dart';

// Respuestas de la API para avisos, zonas y perfil de movilidad
// (docs/api.md).

const categoriasAvisosJson = {
  'categorias': [
    {'id': 1, 'nombre': 'Vereda rota'},
    {'id': 3, 'nombre': 'Cordón sin rampa'},
  ],
};

const preferenciasAvisosJson = {
  'preferencias': [
    {'categoriaId': 1, 'habilitada': true},
    {'categoriaId': 3, 'habilitada': false},
  ],
};

/// Una zona habitual (`GET /zonas-habituales`).
Map<String, Object?> zonaAvisosJson({
  int id = 4,
  String nombre = 'Casa',
  LatLng centro = const LatLng(-38.9516, -68.0591),
  int radioMetros = 300,
  bool activa = true,
}) => {
  'id': id,
  'nombre': nombre,
  'lat': centro.latitude,
  'lon': centro.longitude,
  'radioMetros': radioMetros,
  'activa': activa,
  'creadoEn': '2026-11-04T13:10:00.000Z',
};

/// El servidor de una sesión con avisos. Guarda lo que se va cambiando para
/// que el siguiente `GET` lo devuelva igual que el servidor real.
class ServidorAvisos {
  ServidorAvisos({
    this.rol = 'VECINO',
    List<Map<String, Object?>>? zonas,
    this.perfilMovilidadId,
  }) : zonas = zonas ?? [] {
    servidor = ServidorFalso(_responder);
  }

  late final ServidorFalso servidor;
  final String rol;

  List<Map<String, Object?>> zonas;
  bool notificacionesHabilitadas = true;
  int? perfilMovilidadId;

  List<Map<String, Object?>> preferencias = [
    for (final preferencia in preferenciasAvisosJson['preferencias'] as List)
      Map<String, Object?>.from(preferencia as Map),
  ];

  /// Si no es null, esa ruta responde este error.
  Future<ResponseBody> Function(RequestOptions)? errorZonas;
  Future<ResponseBody> Function(RequestOptions)? errorCategorias;
  Future<ResponseBody> Function(RequestOptions)? errorPreferencias;
  Future<ResponseBody> Function(RequestOptions)? errorGuardarPreferencias;
  Future<ResponseBody> Function(RequestOptions)? errorActualizarUsuario;
  Future<ResponseBody> Function(RequestOptions)? errorGuardarZona;
  Future<ResponseBody> Function(RequestOptions)? errorBorrarZona;
  Future<ResponseBody> Function(RequestOptions)? errorPerfiles;

  int get pedidosZonas => servidor.cantidad('/zonas-habituales');

  List<Pedido> get cambiosDeUsuario => [
    for (final pedido in servidor.pedidos)
      if (pedido.metodo == 'PATCH' && pedido.ruta == '/usuarios/yo') pedido,
  ];

  Future<ResponseBody> _responder(RequestOptions pedido) async {
    final ruta = pedido.path;
    switch (ruta) {
      case '/auth/yo':
        return json(200, {'usuario': _usuario()});
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/incidentes/feed':
        return json(200, {'incidentes': <Object>[], 'siguiente': null});
      case '/categorias':
        return errorCategorias?.call(pedido) ??
            json(200, {'categorias': categoriasAvisosJson['categorias']});
      case '/perfiles-movilidad':
        return errorPerfiles?.call(pedido) ?? json(200, perfilesJson);
      case '/zonas-habituales':
        if (pedido.method == 'POST') {
          if (errorGuardarZona != null) return errorGuardarZona!(pedido);
          final datos = pedido.data as Map;
          final zona = zonaAvisosJson(
            id: 9,
            nombre: datos['nombre'] as String,
            centro: LatLng(datos['lat'] as double, datos['lon'] as double),
            radioMetros: datos['radioMetros'] as int,
            activa: datos['activa'] as bool? ?? true,
          );
          zonas = [...zonas, zona];
          return json(201, zona);
        }
        return errorZonas?.call(pedido) ?? json(200, {'zonas': zonas});
      case '/preferencias-notificacion':
        if (pedido.method == 'PUT') {
          if (errorGuardarPreferencias != null) {
            return errorGuardarPreferencias!(pedido);
          }
          final cambios = (pedido.data as Map)['preferencias'] as List;
          for (final cambio in cambios) {
            final datos = cambio as Map;
            final id = datos['categoriaId'] as int;
            preferencias = [
              for (final preferencia in preferencias)
                (preferencia['categoriaId'] as int) == id
                    ? {'categoriaId': id, 'habilitada': datos['habilitada']}
                    : preferencia,
            ];
          }
          return json(200, {'preferencias': preferencias});
        }
        return errorPreferencias?.call(pedido) ??
            json(200, {'preferencias': preferencias});
      case '/usuarios/yo':
        if (errorActualizarUsuario != null) {
          return errorActualizarUsuario!(pedido);
        }
        final datos = pedido.data as Map;
        if (datos.containsKey('notificacionesHabilitadas')) {
          notificacionesHabilitadas =
              datos['notificacionesHabilitadas'] as bool;
        }
        if (datos.containsKey('perfilMovilidadId')) {
          perfilMovilidadId = datos['perfilMovilidadId'] as int?;
        }
        return json(200, {'usuario': _usuario()});
      default:
        if (ruta.startsWith('/zonas-habituales/')) {
          final id = int.parse(ruta.split('/').last);
          if (pedido.method == 'DELETE') {
            if (errorBorrarZona != null) return errorBorrarZona!(pedido);
            zonas = [
              for (final zona in zonas)
                if (zona['id'] != id) zona,
            ];
            return json(204, '');
          }
          if (pedido.method == 'PUT') {
            if (errorGuardarZona != null) return errorGuardarZona!(pedido);
            final datos = pedido.data as Map;
            final zona = zonaAvisosJson(
              id: id,
              nombre: datos['nombre'] as String,
              centro: LatLng(datos['lat'] as double, datos['lon'] as double),
              radioMetros: datos['radioMetros'] as int,
              activa: datos['activa'] as bool,
            );
            zonas = [
              for (final anterior in zonas)
                anterior['id'] == id ? zona : anterior,
            ];
            return json(200, zona);
          }
        }
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }

  Map<String, Object?> _usuario() => usuarioJson(
    rol: rol,
    perfilMovilidadId: perfilMovilidadId,
    notificacionesHabilitadas: notificacionesHabilitadas,
  );
}
