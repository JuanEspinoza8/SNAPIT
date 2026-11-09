import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/usuario.dart';
import 'modelos.dart';

final repositorioAvisosProvider = Provider<RepositorioAvisos>(
  (ref) => RepositorioAvisos(ref.watch(clienteApiProvider)),
);

/// Si el vecino sigue ese incidente.
final seguimientoProvider = FutureProvider.autoDispose.family<bool, int>(
  (ref, incidenteId) => ref.watch(repositorioAvisosProvider).sigue(incidenteId),
);

/// Las zonas del vecino. Se vuelven a pedir cada vez que se abre la pantalla.
final zonasHabitualesProvider = FutureProvider.autoDispose<List<ZonaHabitual>>(
  (ref) => ref.watch(repositorioAvisosProvider).zonas(),
);

/// Las categorías de avisos, con actualización optimista.
final preferenciasProvider =
    AsyncNotifierProvider.autoDispose<
      PreferenciasNotifier,
      List<PreferenciaCategoria>
    >(PreferenciasNotifier.new);

class PreferenciasNotifier extends AsyncNotifier<List<PreferenciaCategoria>> {
  @override
  Future<List<PreferenciaCategoria>> build() =>
      ref.watch(repositorioAvisosProvider).preferencias();

  Future<void> cambiar(int categoriaId, bool habilitada) async {
    final antes = state.value;
    if (antes == null) return;

    state = AsyncData([
      for (final preferencia in antes)
        preferencia.categoriaId == categoriaId
            ? preferencia.copyWith(habilitada: habilitada)
            : preferencia,
    ]);

    try {
      final guardadas = await ref
          .read(repositorioAvisosProvider)
          .guardarPreferencias([
            PreferenciaCategoria(
              categoriaId: categoriaId,
              habilitada: habilitada,
            ),
          ]);
      if (ref.mounted) state = AsyncData(guardadas);
    } on ErrorApi {
      if (ref.mounted) state = AsyncData(antes);
      rethrow;
    }
  }
}

class RepositorioAvisos {
  RepositorioAvisos(this._dio);

  final Dio _dio;

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

  Future<Usuario> actualizarNotificaciones(bool habilitadas) =>
      actualizarYo({'notificacionesHabilitadas': habilitadas});

  Future<Usuario> actualizarPerfilMovilidad(int? perfilId) =>
      actualizarYo({'perfilMovilidadId': perfilId});

  Future<Usuario> actualizarYo(Map<String, Object?> cambios) =>
      _pedir(() async {
        final respuesta = await _dio.patch<Map<String, dynamic>>(
          '/usuarios/yo',
          data: cambios,
        );
        return Usuario.desdeJson(
          respuesta.data!['usuario'] as Map<String, dynamic>,
        );
      });

  Future<T> _pedir<T>(Future<T> Function() pedido) async {
    try {
      return await pedido();
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
