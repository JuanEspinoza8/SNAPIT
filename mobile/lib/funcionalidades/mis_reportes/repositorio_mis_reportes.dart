import 'dart:typed_data';

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

/// El archivo de una foto, mientras alguna fila la muestre.
final fotoMiaProvider = FutureProvider.autoDispose.family<Uint8List, int>(
  (ref, id) => ref.watch(repositorioMisReportesProvider).foto(id),
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

  /// Una foto de un reporte propio. Va con sesión: así el servidor también da
  /// la de un reporte desestimado o la de un incidente que ya no está en el
  /// mapa, que `Image.network` (sin token) no puede bajar. Todo error sale
  /// como [ErrorApi].
  Future<Uint8List> foto(int id) async {
    try {
      final respuesta = await _dio.get<List<int>>(
        '/fotos/$id',
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(respuesta.data!);
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
