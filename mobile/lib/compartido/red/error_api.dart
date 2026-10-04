import 'dart:developer' as developer;

import 'package:dio/dio.dart';

/// Error de la API con el formato de `docs/api.md`:
/// `{ "error": { "codigo", "mensaje", "detalles"? } }`.
class ErrorApi implements Exception {
  const ErrorApi({
    required this.codigo,
    required this.mensaje,
    this.status,
    this.detalles = const [],
  });

  /// Convierte cualquier error en uno con un mensaje para mostrar.
  factory ErrorApi.desde(Object error) {
    if (error is ErrorApi) return error;
    if (error is! DioException) {
      developer.log('Error inesperado', name: 'api', error: error);
      return _inesperado;
    }

    if (_tiposSinConexion.contains(error.type)) return _sinConexion;

    final respuesta = error.response;
    final cuerpo = respuesta?.data;
    if (cuerpo is Map && cuerpo['error'] is Map) {
      final datos = cuerpo['error'] as Map;
      final codigo = datos['codigo'];
      final mensaje = datos['mensaje'];
      if (codigo is String && mensaje is String) {
        return ErrorApi(
          status: respuesta?.statusCode,
          codigo: codigo,
          mensaje: mensaje,
          detalles: _leerDetalles(datos['detalles']),
        );
      }
    }

    developer.log(
      'Respuesta sin el formato de error de la API: '
      '${error.requestOptions.method} ${error.requestOptions.uri} '
      '→ ${respuesta?.statusCode} '
      '(X-Request-Id: ${respuesta?.headers.value('x-request-id')})',
      name: 'api',
      error: error,
    );
    return ErrorApi(
      status: respuesta?.statusCode,
      codigo: _inesperado.codigo,
      mensaje: _inesperado.mensaje,
    );
  }

  final int? status;
  final String codigo;
  final String mensaje;
  final List<DetalleError> detalles;

  static const _tiposSinConexion = {
    DioExceptionType.connectionError,
    DioExceptionType.connectionTimeout,
    DioExceptionType.sendTimeout,
    DioExceptionType.receiveTimeout,
  };
  static const _sinConexion = ErrorApi(
    codigo: 'SIN_CONEXION',
    mensaje:
        'No se pudo conectar con el servidor. Revisá tu conexión e intentá '
        'de nuevo.',
  );
  static const _inesperado = ErrorApi(
    codigo: 'ERROR_INESPERADO',
    mensaje: 'Ocurrió un error inesperado. Intentá de nuevo en unos minutos.',
  );

  static List<DetalleError> _leerDetalles(Object? lista) {
    if (lista is! List) return const [];
    return [
      for (final item in lista)
        if (item is Map && item['campo'] is String && item['mensaje'] is String)
          DetalleError(
            campo: item['campo'] as String,
            mensaje: item['mensaje'] as String,
          ),
    ];
  }

  @override
  String toString() => 'ErrorApi($status, $codigo, $mensaje)';
}

/// Problema puntual de un campo de la entrada.
class DetalleError {
  const DetalleError({required this.campo, required this.mensaje});

  final String campo;
  final String mensaje;
}
