import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import 'borrador_reporte.dart';

final repositorioReportesProvider = Provider<RepositorioReportes>(
  (ref) => RepositorioReportesApi(ref.watch(clienteApiProvider)),
);

/// Respuesta de `POST /reportes`.
class ReporteEnviado {
  const ReporteEnviado({required this.id, required this.incidenteId});

  factory ReporteEnviado.desdeJson(Map<String, dynamic> json) => ReporteEnviado(
    id: json['id'] as int,
    incidenteId: json['incidenteId'] as int?,
  );

  final int id;
  final int? incidenteId;
}

/// Por dónde sale un reporte. Hoy va directo al servidor; el modo sin conexión
/// (I83) puede sumar otra implementación que lo guarde en una cola, sin tocar
/// la pantalla.
abstract interface class RepositorioReportes {
  /// Todo error sale como [ErrorApi].
  Future<ReporteEnviado> enviar(BorradorReporte borrador);
}

class RepositorioReportesApi implements RepositorioReportes {
  RepositorioReportesApi(this._dio);

  final Dio _dio;

  static const _fotoPerdida =
      'No se encontró la foto. Sacala o elegila de nuevo.';

  @override
  Future<ReporteEnviado> enviar(BorradorReporte borrador) async {
    final MultipartFile foto;
    try {
      // El archivo tal cual, sin recomprimir: el servidor lee su EXIF.
      foto = MultipartFile.fromFileSync(borrador.foto!.ruta);
    } on FileSystemException {
      // Android puede limpiar la carpeta temporal donde quedó la foto.
      throw const ErrorApi(
        codigo: 'FOTO_NO_DISPONIBLE',
        mensaje: _fotoPerdida,
        detalles: [DetalleError(campo: 'foto', mensaje: _fotoPerdida)],
      );
    }

    try {
      final formulario = FormData.fromMap({...borrador.campos(), 'foto': foto});
      final respuesta = await _dio.post<Map<String, dynamic>>(
        '/reportes',
        data: formulario,
        // Una foto sin achicar puede pesar varios MB y tardar en subir con
        // poca señal; sin este límite, una conexión trabada no avisaría nunca.
        options: Options(sendTimeout: const Duration(minutes: 2)),
      );
      return ReporteEnviado.desdeJson(respuesta.data!);
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
