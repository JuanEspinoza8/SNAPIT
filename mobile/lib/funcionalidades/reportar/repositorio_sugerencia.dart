import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import 'borrador_reporte.dart';

final repositorioSugerenciaProvider = Provider<RepositorioSugerencia>(
  (ref) => RepositorioSugerencia(ref.watch(clienteApiProvider)),
);

/// Pide la sugerencia de categoría y gravedad de una foto (F06). Va aparte de
/// `RepositorioReportes` porque solo funciona con conexión: el modo sin
/// conexión (I83) reemplaza el envío, no esto.
class RepositorioSugerencia {
  RepositorioSugerencia(this._dio);

  final Dio _dio;

  /// Todo error sale como [ErrorApi], salvo la cancelación con [cancelar],
  /// que sale como la `DioException` de dio.
  Future<SugerenciaIa> pedir(String rutaFoto, {CancelToken? cancelar}) async {
    try {
      // El archivo original, igual que en el reporte.
      final formulario = FormData.fromMap({
        'foto': MultipartFile.fromFileSync(rutaFoto),
      });
      final respuesta = await _dio.post<Map<String, dynamic>>(
        '/ia/clasificar-foto',
        data: formulario,
        cancelToken: cancelar,
        options: Options(
          sendTimeout: const Duration(minutes: 2),
          // El servidor corta a los 30 s (IA_TIMEOUT_MS). Con los 20 s del
          // cliente se perdería una sugerencia que ya se pidió y se pagó.
          receiveTimeout: const Duration(seconds: 35),
        ),
      );
      return SugerenciaIa.desdeJson(respuesta.data!);
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) rethrow;
      throw ErrorApi.desde(e);
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
