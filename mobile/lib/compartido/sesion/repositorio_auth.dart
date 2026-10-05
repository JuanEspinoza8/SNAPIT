import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../red/cliente_api.dart';
import '../red/error_api.dart';
import '../red/interceptor_sesion.dart';
import 'usuario.dart';

final repositorioAuthProvider = Provider<RepositorioAuth>(
  (ref) => RepositorioAuth(ref.watch(clienteApiProvider)),
);

/// Respuesta de `POST /auth/ingreso`.
class Ingreso {
  const Ingreso({
    required this.tokenAcceso,
    required this.tokenRenovacion,
    required this.usuario,
  });

  factory Ingreso.desdeJson(Map<String, dynamic> json) => Ingreso(
    tokenAcceso: json['tokenAcceso'] as String,
    tokenRenovacion: json['tokenRenovacion'] as String,
    usuario: Usuario.desdeJson(json['usuario'] as Map<String, dynamic>),
  );

  final String tokenAcceso;
  final String tokenRenovacion;
  final Usuario usuario;
}

/// Rutas de `/auth` (contrato en `docs/api.md`). Todo error sale como
/// [ErrorApi].
class RepositorioAuth {
  RepositorioAuth(this._dio);

  final Dio _dio;

  // Las rutas públicas no llevan token: así un 401 de un ingreso fallido
  // nunca dispara una renovación.
  Options get _sinSesion => Options(extra: {InterceptorSesion.sinSesion: true});

  Future<Ingreso> ingresar({required String email, required String clave}) {
    return _pedir(() async {
      final respuesta = await _dio.post<Map<String, dynamic>>(
        '/auth/ingreso',
        data: {'email': email, 'clave': clave},
        options: _sinSesion,
      );
      return Ingreso.desdeJson(respuesta.data!);
    });
  }

  Future<void> registrar({
    required String nombre,
    required String email,
    required String clave,
  }) {
    return _pedir(
      () => _dio.post<void>(
        '/auth/registro',
        data: {'nombre': nombre, 'email': email, 'clave': clave},
        options: _sinSesion,
      ),
    );
  }

  Future<void> recuperarClave(String email) {
    return _pedir(
      () => _dio.post<void>(
        '/auth/recuperar-clave',
        data: {'email': email},
        options: _sinSesion,
      ),
    );
  }

  Future<void> salir(String tokenRenovacion) {
    return _pedir(
      () => _dio.post<void>(
        '/auth/salir',
        data: {'tokenRenovacion': tokenRenovacion},
        options: _sinSesion,
      ),
    );
  }

  Future<Usuario> yo() {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>('/auth/yo');
      return Usuario.desdeJson(
        respuesta.data!['usuario'] as Map<String, dynamic>,
      );
    });
  }

  Future<T> _pedir<T>(Future<T> Function() pedido) async {
    try {
      return await pedido();
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
