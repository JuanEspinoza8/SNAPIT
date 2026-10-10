import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'compartido/rutas/rutas_app.dart';
import 'compartido/tema/tema_app.dart';

class AppSnapIt extends ConsumerWidget {
  const AppSnapIt({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'SnapIt',
      theme: crearTema(),
      // Los textos propios de Material (el calendario, el botón atrás) en
      // castellano.
      locale: const Locale('es', 'AR'),
      supportedLocales: const [Locale('es', 'AR')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: ref.watch(rutasProvider),
    );
  }
}
