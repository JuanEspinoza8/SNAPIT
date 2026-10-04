import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../funcionalidades/inicio/pantalla_inicio.dart';

abstract final class Rutas {
  static const inicio = '/';
}

final rutasProvider = Provider<GoRouter>((ref) {
  final rutas = GoRouter(
    routes: [
      GoRoute(
        path: Rutas.inicio,
        builder: (context, state) => const PantallaInicio(),
      ),
    ],
  );
  ref.onDispose(rutas.dispose);
  return rutas;
});
