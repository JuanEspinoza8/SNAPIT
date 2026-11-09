import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import 'modelos.dart';

final repositorioAvisosProvider = Provider<RepositorioAvisos>(
  (ref) => RepositorioAvisos(ref.watch(clienteApiProvider)),
);

/// Las rutas de avisos (docs/api.md, sección «Avisos al vecino»). Todas piden
/// sesión. Todo error sale como [ErrorApi].
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

  Future<T> _pedir<T>(Future<T> Function() pedido) async {
    try {
      return await pedido();
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
