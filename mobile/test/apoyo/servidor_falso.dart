import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

typedef Pedido = ({
  String ruta,
  String? token,
  Object? datos,
  Map<String, dynamic> consulta,
});

/// Reemplaza la red de dio: cada petición se responde con [responder] y queda
/// registrada en [pedidos] con el token que llevaba en ese momento.
class ServidorFalso implements HttpClientAdapter {
  ServidorFalso(this.responder);

  Future<ResponseBody> Function(RequestOptions pedido) responder;
  final pedidos = <Pedido>[];

  int cantidad(String ruta) => pedidos.where((p) => p.ruta == ruta).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    pedidos.add((
      ruta: options.path,
      token: options.headers['Authorization'] as String?,
      datos: options.data,
      consulta: options.queryParameters,
    ));
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

Future<ResponseBody> json(int status, Object cuerpo) async {
  return ResponseBody.fromString(
    jsonEncode(cuerpo),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

Future<ResponseBody> errorApi(int status, String codigo, String mensaje) {
  return json(status, {
    'error': {'codigo': codigo, 'mensaje': mensaje},
  });
}

Never sinConexion(RequestOptions pedido) {
  throw DioException.connectionError(
    requestOptions: pedido,
    reason: 'Connection refused',
  );
}
