import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/rutas/rutas_app.dart';
import 'mapa_incidentes.dart';

/// El mapa para quien no inició sesión.
class PantallaMapaPublico extends StatelessWidget {
  const PantallaMapaPublico({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mapa de incidentes'),
        // Para volver está «Ingresar»; el botón atrás del sistema también.
        automaticallyImplyLeading: false,
        actions: [
          TextButton(
            onPressed: () => context.go(Rutas.ingreso),
            child: const Text('Ingresar'),
          ),
        ],
      ),
      body: const SafeArea(child: MapaIncidentes()),
    );
  }
}
