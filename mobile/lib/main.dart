import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'compartido/tema/modo_tema.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // El tema se lee antes de dibujar: si no, quien eligió el claro vería la
  // primera pantalla en oscuro.
  final tema = await ModoTemaNotifier.leerGuardado();
  runApp(
    ProviderScope(
      // Riverpod reintenta por su cuenta los providers que fallan. Acá el
      // error se le muestra al usuario y él decide si reintentar.
      retry: (_, _) => null,
      overrides: [modoTemaGuardadoProvider.overrideWithValue(tema)],
      child: const AppSnapIt(),
    ),
  );
}
