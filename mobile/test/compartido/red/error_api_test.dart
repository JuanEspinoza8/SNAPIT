import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/error_api.dart';

DioException respuesta(int status, Object? cuerpo) {
  final pedido = RequestOptions(path: '/recurso');
  return DioException.badResponse(
    statusCode: status,
    requestOptions: pedido,
    response: Response(
      requestOptions: pedido,
      statusCode: status,
      data: cuerpo,
    ),
  );
}

void main() {
  test('toma código, mensaje y detalles del formato de la API', () {
    final error = ErrorApi.desde(
      respuesta(400, {
        'error': {
          'codigo': 'DATOS_INVALIDOS',
          'mensaje': 'Hay datos inválidos',
          'detalles': [
            {'campo': 'email', 'mensaje': 'No es un correo válido'},
          ],
        },
      }),
    );

    expect(error.status, 400);
    expect(error.codigo, 'DATOS_INVALIDOS');
    expect(error.mensaje, 'Hay datos inválidos');
    expect(error.detalles.single.campo, 'email');
    expect(error.detalles.single.mensaje, 'No es un correo válido');
  });

  test('sin conexión o sin respuesta a tiempo devuelve SIN_CONEXION', () {
    final pedido = RequestOptions(path: '/recurso');

    for (final error in [
      DioException.connectionError(requestOptions: pedido, reason: 'refused'),
      DioException.connectionTimeout(
        timeout: const Duration(seconds: 10),
        requestOptions: pedido,
      ),
      DioException.receiveTimeout(
        timeout: const Duration(seconds: 20),
        requestOptions: pedido,
      ),
    ]) {
      expect(ErrorApi.desde(error).codigo, 'SIN_CONEXION');
    }
  });

  test('una respuesta sin el formato de la API da un mensaje genérico', () {
    final error = ErrorApi.desde(respuesta(502, '<html>Bad Gateway</html>'));

    expect(error.status, 502);
    expect(error.codigo, 'ERROR_INESPERADO');
    expect(error.mensaje, isNotEmpty);
  });

  test('ignora los detalles que no tienen campo y mensaje', () {
    final error = ErrorApi.desde(
      respuesta(400, {
        'error': {
          'codigo': 'DATOS_INVALIDOS',
          'mensaje': 'Hay datos inválidos',
          'detalles': [
            {'campo': 'email'},
            'texto suelto',
          ],
        },
      }),
    );

    expect(error.detalles, isEmpty);
  });

  test('un error que no viene de la red da un mensaje genérico', () {
    expect(ErrorApi.desde(StateError('x')).codigo, 'ERROR_INESPERADO');
  });
}
