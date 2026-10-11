import 'package:dio/dio.dart';

import '../sesion/almacen_sesion.dart';

/// Agrega el token de acceso a cada petición. Ante un 401 renueva la sesión
/// una vez con `POST /auth/renovar` y reintenta (ver `docs/api.md`).
class InterceptorSesion extends Interceptor {
  InterceptorSesion({
    required this._dio,
    required this._almacen,
    this._alPerderSesion,
  });

  final Dio _dio;
  final AlmacenSesion _almacen;

  /// Se llama después de borrar los tokens, cuando la sesión ya no sirve.
  final void Function()? _alPerderSesion;

  /// Marca para peticiones que no llevan token, como la propia renovación.
  static const sinSesion = 'sinSesion';
  static const _reintentada = 'reintentada';

  // El servidor rota el token de renovación en cada uso: si dos peticiones
  // reciben 401 a la vez, la segunda espera esta misma renovación en lugar de
  // gastar un token que ya no sirve.
  Future<String?>? _renovacionEnCurso;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.extra[sinSesion] != true) {
      final token = await _almacen.leerTokenAcceso();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final opciones = err.requestOptions;
    final tokenUsado = _tokenEnviado(opciones);
    if (err.response?.statusCode != 401 ||
        tokenUsado == null ||
        opciones.extra[_reintentada] == true) {
      handler.next(err);
      return;
    }

    try {
      final tokenAcceso = await _tokenParaReintentar(tokenUsado);
      if (tokenAcceso == null) {
        handler.next(err);
        return;
      }
      opciones.extra[_reintentada] = true;
      // Un formulario con archivo (la foto de un reporte) se puede mandar una
      // sola vez: para reintentar hace falta una copia.
      if (opciones.data case final FormData formulario) {
        opciones.data = formulario.clone();
      }
      handler.resolve(await _dio.fetch<dynamic>(opciones));
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  String? _tokenEnviado(RequestOptions opciones) {
    final encabezado = opciones.headers['Authorization'];
    if (encabezado is! String || !encabezado.startsWith('Bearer ')) return null;
    return encabezado.substring('Bearer '.length);
  }

  /// Devuelve el token con el que reintentar: el que ya dejó otra petición o
  /// uno nuevo. Null si ya no hay sesión.
  Future<String?> _tokenParaReintentar(String tokenUsado) async {
    final guardado = await _almacen.leerTokenAcceso();
    if (guardado == null) return null;
    if (guardado != tokenUsado) return guardado;
    return _renovacionEnCurso ??= _renovar().whenComplete(
      () => _renovacionEnCurso = null,
    );
  }

  Future<String?> _renovar() async {
    final tokenRenovacion = await _almacen.leerTokenRenovacion();
    if (tokenRenovacion == null) {
      await _descartarSesion();
      return null;
    }

    try {
      final respuesta = await _dio.post<Map<String, dynamic>>(
        '/auth/renovar',
        data: {'tokenRenovacion': tokenRenovacion},
        options: Options(extra: {sinSesion: true}),
      );
      final tokenAcceso = respuesta.data?['tokenAcceso'];
      final nuevoTokenRenovacion = respuesta.data?['tokenRenovacion'];
      if (tokenAcceso is! String || nuevoTokenRenovacion is! String) {
        await _descartarSesion();
        return null;
      }
      await _almacen.guardar(
        tokenAcceso: tokenAcceso,
        tokenRenovacion: nuevoTokenRenovacion,
      );
      return tokenAcceso;
    } on DioException catch (e) {
      // Si el servidor rechazó la renovación, la sesión ya no sirve. Sin
      // conexión o con un error del servidor se conserva para otro intento.
      final status = e.response?.statusCode;
      if (status != null && status >= 400 && status < 500) {
        await _descartarSesion();
      }
      rethrow;
    }
  }

  Future<void> _descartarSesion() async {
    await _almacen.borrar();
    _alPerderSesion?.call();
  }
}
