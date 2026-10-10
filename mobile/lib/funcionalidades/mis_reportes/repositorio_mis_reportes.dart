import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import 'modelos.dart';

final repositorioMisReportesProvider = Provider<RepositorioMisReportes>(
  (ref) => RepositorioMisReportes(ref.watch(clienteApiProvider)),
);

/// Vive mientras la pestaña está armada: al salir de la cuenta se descarta y
/// otra cuenta no ve la lista anterior.
final misReportesProvider = FutureProvider.autoDispose<List<ReporteMio>>(
  (ref) => ref.watch(repositorioMisReportesProvider).mios(),
);

class RepositorioMisReportes {
  RepositorioMisReportes(this._dio);

  final Dio _dio;

  /// Del más nuevo al más viejo. Va con sesión: el servidor saca el vecino
  /// del token. Todo error sale como [ErrorApi].
  Future<List<ReporteMio>> mios() async {
    try {
      final respuesta = await _dio.get<Map<String, dynamic>>('/reportes/mios');
      return [
        for (final reporte in respuesta.data!['reportes'] as List)
          ReporteMio.desdeJson(reporte as Map<String, dynamic>),
      ];
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
