import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';

// «Sigue estando» (F12): el vecino confirma que el problema sigue ahí
// (docs/api.md, `POST /api/incidentes/:id/confirmaciones`).

final repositorioConfirmacionesProvider = Provider<RepositorioConfirmaciones>(
  (ref) => RepositorioConfirmaciones(ref.watch(clienteApiProvider)),
);

/// Si el vecino ya confirmó que ese incidente sigue.
final confirmacionProvider = FutureProvider.autoDispose.family<bool, int>(
  (ref, incidenteId) =>
      ref.watch(repositorioConfirmacionesProvider).confirmado(incidenteId),
);

/// Las dos rutas piden la sesión de un vecino. Todo error sale como
/// [ErrorApi].
class RepositorioConfirmaciones {
  RepositorioConfirmaciones(this._dio);

  final Dio _dio;

  Future<bool> confirmado(int incidenteId) => _pedir(() async {
    final respuesta = await _dio.get<Map<String, dynamic>>(
      '/incidentes/$incidenteId/confirmacion',
    );
    return respuesta.data!['confirmado'] as bool;
  });

  /// Devuelve cuántos vecinos confirmaron, contando esta confirmación.
  Future<int> confirmar(int incidenteId) => _pedir(() async {
    final respuesta = await _dio.post<Map<String, dynamic>>(
      '/incidentes/$incidenteId/confirmaciones',
    );
    return respuesta.data!['cantidadConfirmaciones'] as int;
  });

  Future<T> _pedir<T>(Future<T> Function() pedido) async {
    try {
      return await pedido();
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
