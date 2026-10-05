import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../red/error_api.dart';
import 'almacen_sesion.dart';
import 'repositorio_auth.dart';
import 'usuario.dart';

/// Quién está usando la app: cargando mientras se revisa la sesión guardada,
/// `null` si no hay sesión y el usuario si la hay. Las rutas dependen de esto.
final sesionProvider = AsyncNotifierProvider<Sesion, Usuario?>(Sesion.new);

class Sesion extends AsyncNotifier<Usuario?> {
  AlmacenSesion get _almacen => ref.read(almacenSesionProvider);
  RepositorioAuth get _repositorio => ref.read(repositorioAuthProvider);

  /// Al abrir la app: si hay tokens guardados, le pregunta al servidor quién
  /// es. Si el acceso venció, el interceptor renueva antes de responder.
  @override
  Future<Usuario?> build() async {
    if (await _almacen.leerTokenRenovacion() == null) return null;
    try {
      return await _repositorio.yo();
    } on ErrorApi catch (e) {
      // 401 acá quiere decir que la renovación también se rechazó.
      if (e.status == 401) {
        await _almacen.borrar();
        return null;
      }
      // Sin conexión o error del servidor: la sesión se conserva y la
      // pantalla de arranque ofrece reintentar.
      rethrow;
    }
  }

  /// Los errores llegan a la pantalla de ingreso como [ErrorApi].
  Future<void> ingresar({required String email, required String clave}) async {
    final ingreso = await _repositorio.ingresar(email: email, clave: clave);
    await _almacen.guardar(
      tokenAcceso: ingreso.tokenAcceso,
      tokenRenovacion: ingreso.tokenRenovacion,
    );
    state = AsyncData(ingreso.usuario);
  }

  /// Cierra la sesión en el teléfono enseguida y avisa al servidor sin
  /// esperarlo: si no hay red, esa sesión vence sola en el servidor.
  Future<void> salir() async {
    final repositorio = _repositorio;
    final tokenRenovacion = await _almacen.leerTokenRenovacion();
    await _almacen.borrar();
    state = const AsyncData(null);
    if (tokenRenovacion == null) return;
    unawaited(
      repositorio
          .salir(tokenRenovacion)
          .catchError(
            (Object e) => developer.log(
              'No se pudo cerrar la sesión en el servidor',
              name: 'sesion',
              error: e,
            ),
          ),
    );
  }

  /// La llama el interceptor cuando el servidor rechaza la renovación y ya
  /// borró los tokens.
  void sesionPerdida() {
    // Durante el arranque no hace falta: `build` ya devuelve null.
    if (state.value != null) state = const AsyncData(null);
  }
}
