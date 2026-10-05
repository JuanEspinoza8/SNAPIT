import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/entorno.dart';
import '../sesion/almacen_sesion.dart';
import '../sesion/sesion.dart';
import 'interceptor_sesion.dart';

/// Cliente HTTP que usan todos los repositorios de la app.
final clienteApiProvider = Provider<Dio>((ref) {
  final dio = crearClienteApi(
    urlBase: Entorno.apiUrl,
    almacen: ref.watch(almacenSesionProvider),
    alPerderSesion: () => ref.read(sesionProvider.notifier).sesionPerdida(),
  );
  ref.onDispose(dio.close);
  return dio;
});

Dio crearClienteApi({
  required String urlBase,
  required AlmacenSesion almacen,
  void Function()? alPerderSesion,
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: urlBase,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
    ),
  );
  dio.interceptors.add(
    InterceptorSesion(
      dio: dio,
      almacen: almacen,
      alPerderSesion: alPerderSesion,
    ),
  );
  return dio;
}
