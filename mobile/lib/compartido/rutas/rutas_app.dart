import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../funcionalidades/cuenta/pantalla_arranque.dart';
import '../../funcionalidades/cuenta/pantalla_ingreso.dart';
import '../../funcionalidades/cuenta/pantalla_recuperar_clave.dart';
import '../../funcionalidades/cuenta/pantalla_registro.dart';
import '../../funcionalidades/principal/pantalla_principal.dart';
import '../sesion/sesion.dart';
import '../sesion/usuario.dart';

abstract final class Rutas {
  static const arranque = '/arranque';
  static const ingreso = '/ingreso';
  static const registro = '/registro';
  static const recuperarClave = '/recuperar-clave';
  static const principal = '/';
}

/// Las que se usan sin sesión. Con sesión, llevan a la principal.
const _rutasDeCuenta = {Rutas.ingreso, Rutas.registro, Rutas.recuperarClave};

final rutasProvider = Provider<GoRouter>((ref) {
  // El router se crea una sola vez. Cuando cambia la sesión, solo vuelve a
  // calcular la redirección.
  final sesion = ValueNotifier<AsyncValue<Usuario?>>(ref.read(sesionProvider));
  ref.listen(sesionProvider, (_, nueva) => sesion.value = nueva);

  final rutas = GoRouter(
    initialLocation: Rutas.arranque,
    refreshListenable: sesion,
    redirect: (_, estado) => redireccion(sesion.value, estado.matchedLocation),
    routes: [
      GoRoute(
        path: Rutas.arranque,
        builder: (_, _) => const PantallaArranque(),
      ),
      GoRoute(path: Rutas.ingreso, builder: (_, _) => const PantallaIngreso()),
      GoRoute(
        path: Rutas.registro,
        builder: (_, _) => const PantallaRegistro(),
      ),
      GoRoute(
        path: Rutas.recuperarClave,
        builder: (_, _) => const PantallaRecuperarClave(),
      ),
      GoRoute(
        path: Rutas.principal,
        builder: (_, _) => const PantallaPrincipal(),
      ),
    ],
  );
  ref.onDispose(() {
    rutas.dispose();
    sesion.dispose();
  });
  return rutas;
});

/// A dónde tiene que ir la app según la sesión. Null: se queda en [ruta].
@visibleForTesting
String? redireccion(AsyncValue<Usuario?> sesion, String ruta) {
  // Mientras se revisa la sesión guardada, o si no se pudo revisar.
  if (sesion.isLoading || sesion.hasError) {
    return ruta == Rutas.arranque ? null : Rutas.arranque;
  }
  final esDeCuenta = _rutasDeCuenta.contains(ruta);
  if (sesion.value == null) return esDeCuenta ? null : Rutas.ingreso;
  return esDeCuenta || ruta == Rutas.arranque ? Rutas.principal : null;
}
