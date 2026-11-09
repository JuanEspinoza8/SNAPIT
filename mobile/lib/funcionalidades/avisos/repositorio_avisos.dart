import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import 'modelos.dart';

final repositorioAvisosProvider = Provider<RepositorioAvisos>(
  (ref) => RepositorioAvisos(ref.watch(clienteApiProvider)),
);

/// Las rutas de avisos (docs/api.md, sección «Avisos al vecino»): el
/// celular, la lista, el seguimiento, las zonas y las preferencias. Todas
/// piden sesión. El interruptor general va con el usuario, en
/// `RepositorioAuth`. Todo error sale como [ErrorApi].
class RepositorioAvisos {
  RepositorioAvisos(this._dio);

  final Dio _dio;

  /// Registra el celular para recibir avisos. Si el token ya estaba, el
  /// servidor lo pasa a esta cuenta en vez de duplicarlo.
  Future<void> registrarDispositivo(String tokenPush) {
    return _pedir(
      () => _dio.post<void>(
        '/dispositivos',
        data: {'tokenPush': tokenPush, 'plataforma': 'ANDROID'},
      ),
    );
  }

  Future<List<Aviso>> listar() {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>('/notificaciones');
      return [
        for (final aviso in respuesta.data!['notificaciones'] as List)
          Aviso.desdeJson(aviso as Map<String, dynamic>),
      ];
    });
  }

  Future<void> marcarLeida(int id) {
    return _pedir(() => _dio.post<void>('/notificaciones/$id/leida'));
  }

  Future<bool> sigue(int incidenteId) => _pedir(() async {
    final respuesta = await _dio.get<Map<String, dynamic>>(
      '/incidentes/$incidenteId/seguimiento',
    );
    return respuesta.data!['siguiendo'] as bool;
  });

  Future<void> seguir(int incidenteId) => _pedir(() async {
    await _dio.post<void>('/incidentes/$incidenteId/seguimiento');
  });

  Future<void> dejarDeSeguir(int incidenteId) => _pedir(() async {
    await _dio.delete<void>('/incidentes/$incidenteId/seguimiento');
  });

  Future<List<ZonaHabitual>> zonas() => _pedir(() async {
    final respuesta = await _dio.get<Map<String, dynamic>>('/zonas-habituales');
    return [
      for (final zona in respuesta.data!['zonas'] as List)
        ZonaHabitual.desdeJson(zona as Map<String, dynamic>),
    ];
  });

  Future<ZonaHabitual> crearZona(DatosZona datos) => _pedir(() async {
    final respuesta = await _dio.post<Map<String, dynamic>>(
      '/zonas-habituales',
      data: datos.toJson(),
    );
    return ZonaHabitual.desdeJson(respuesta.data!);
  });

  Future<ZonaHabitual> actualizarZona(int id, DatosZona datos) =>
      _pedir(() async {
        final respuesta = await _dio.put<Map<String, dynamic>>(
          '/zonas-habituales/$id',
          data: datos.toJson(),
        );
        return ZonaHabitual.desdeJson(respuesta.data!);
      });

  Future<void> borrarZona(int id) => _pedir(() async {
    await _dio.delete<void>('/zonas-habituales/$id');
  });

  Future<List<PreferenciaCategoria>> preferencias() => _pedir(() async {
    final respuesta = await _dio.get<Map<String, dynamic>>(
      '/preferencias-notificacion',
    );
    return [
      for (final preferencia in respuesta.data!['preferencias'] as List)
        PreferenciaCategoria.desdeJson(preferencia as Map<String, dynamic>),
    ];
  });

  Future<List<PreferenciaCategoria>> guardarPreferencias(
    List<PreferenciaCategoria> cambios,
  ) => _pedir(() async {
    final respuesta = await _dio.put<Map<String, dynamic>>(
      '/preferencias-notificacion',
      data: {
        'preferencias': [for (final cambio in cambios) cambio.toJson()],
      },
    );
    return [
      for (final preferencia in respuesta.data!['preferencias'] as List)
        PreferenciaCategoria.desdeJson(preferencia as Map<String, dynamic>),
    ];
  });

  Future<T> _pedir<T>(Future<T> Function() pedido) async {
    try {
      return await pedido();
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
