import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import 'seccion.dart';

/// La barra de abajo, fija en todas las pantallas con sesión: la principal y
/// los detalles que se abren encima (un reporte, un incidente, los avisos,
/// editar el perfil). Tocar una sección desde un detalle vuelve a la principal
/// en esa sección. Sin sesión (un detalle público) no hay barra.
class MarcoConBarra extends ConsumerWidget {
  const MarcoConBarra({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usuario = ref.watch(sesionProvider).value;
    if (usuario == null) return child;
    final secciones = Seccion.de(usuario.rol);
    final abierta = ref.watch(seccionProvider);
    final indice = secciones.indexOf(abierta);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: indice < 0 ? 0 : indice,
        onDestinationSelected: (elegida) {
          ref.read(seccionProvider.notifier).abrir(secciones[elegida]);
          // Desde un detalle, vuelve a la principal (cierra lo que estaba
          // encima); en la principal no cambia nada más que la sección.
          context.go(Rutas.principal);
        },
        destinations: [
          for (final seccion in secciones)
            NavigationDestination(
              icon: Icon(seccion.icono),
              label: seccion.nombre,
            ),
        ],
      ),
    );
  }
}
