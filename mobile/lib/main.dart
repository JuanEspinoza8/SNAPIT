import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

void main() {
  runApp(
    ProviderScope(
      // Riverpod reintenta por su cuenta los providers que fallan. Acá el
      // error se le muestra al usuario y él decide si reintentar.
      retry: (_, _) => null,
      child: const AppSnapIt(),
    ),
  );
}
