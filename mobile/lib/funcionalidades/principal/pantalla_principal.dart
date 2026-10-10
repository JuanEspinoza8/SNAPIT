import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/mapa_incidentes.dart';

/// Lo primero que se ve con sesión. El vecino tiene mapa, reportar y mis
/// reportes; operador y administrador, solo el mapa: la gestión es en la web.
class PantallaPrincipal extends ConsumerStatefulWidget {
  const PantallaPrincipal({super.key});

  @override
  ConsumerState<PantallaPrincipal> createState() => _PantallaPrincipalState();
}

class _PantallaPrincipalState extends ConsumerState<PantallaPrincipal> {
  var _seccion = 0;

  // Reportar y mis reportes llegan con la #15 y la #16.
  static const _seccionesVecino = [
    _Seccion('Mapa', Icons.map_outlined, 'Mapa de incidentes'),
    _Seccion('Reportar', Icons.add_a_photo_outlined, 'Reportar un problema'),
    _Seccion('Mis reportes', Icons.list_alt_outlined, 'Mis reportes'),
  ];
  static const _mapa = _Seccion(
    'Mapa',
    Icons.map_outlined,
    'Mapa de incidentes',
  );

  @override
  Widget build(BuildContext context) {
    final usuario = ref.watch(sesionProvider).value;
    // Sin sesión el router ya está llevando al ingreso.
    if (usuario == null) return const SizedBox.shrink();

    final esVecino = usuario.rol == Rol.vecino;
    final seccion = esVecino ? _seccionesVecino[_seccion] : _mapa;

    return Scaffold(
      appBar: AppBar(
        title: Text(seccion.titulo),
        actions: [
          IconButton(
            tooltip: 'Cuenta',
            icon: const Icon(Icons.account_circle_outlined),
            onPressed: () => _mostrarCuenta(context, usuario),
          ),
        ],
      ),
      body: SafeArea(
        child: esVecino
            // Las secciones quedan vivas al cambiar de pestaña: el mapa no
            // pierde la zona ni los filtros.
            ? IndexedStack(
                index: _seccion,
                children: [
                  const MapaIncidentes(),
                  for (final s in _seccionesVecino.skip(1))
                    _SeccionPendiente(s),
                ],
              )
            : const Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _AvisoPanelWeb(),
                  Expanded(child: MapaIncidentes()),
                ],
              ),
      ),
      bottomNavigationBar: esVecino
          ? NavigationBar(
              selectedIndex: _seccion,
              onDestinationSelected: (i) => setState(() => _seccion = i),
              destinations: [
                for (final s in _seccionesVecino)
                  NavigationDestination(icon: Icon(s.icono), label: s.nombre),
              ],
            )
          : null,
    );
  }

  void _mostrarCuenta(BuildContext context, Usuario usuario) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (contexto) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            Espacio.lg,
            0,
            Espacio.lg,
            Espacio.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                usuario.nombre,
                style: Theme.of(contexto).textTheme.titleMedium,
              ),
              const SizedBox(height: Espacio.xs),
              Text(usuario.email),
              const SizedBox(height: Espacio.xs),
              Text(
                usuario.rol.etiqueta,
                style: Theme.of(contexto).textTheme.bodySmall?.copyWith(
                  color: Theme.of(contexto).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: Espacio.xl),
              OutlinedButton.icon(
                icon: const Icon(Icons.logout),
                label: const Text('Salir'),
                onPressed: () {
                  Navigator.of(contexto).pop();
                  ref.read(sesionProvider.notifier).salir();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Seccion {
  const _Seccion(this.nombre, this.icono, this.titulo);

  final String nombre;
  final IconData icono;
  final String titulo;
}

class _AvisoPanelWeb extends StatelessWidget {
  const _AvisoPanelWeb();

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tema.colorScheme.surfaceContainerLow,
        border: Border(bottom: BorderSide(color: tema.colorScheme.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(Espacio.lg),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, color: tema.colorScheme.primary),
            const SizedBox(width: Espacio.md),
            const Expanded(
              child: Text(
                'Desde la app podés ver el mapa. La gestión de incidentes se '
                'hace en el panel web.',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SeccionPendiente extends StatelessWidget {
  const _SeccionPendiente(this.seccion);

  final _Seccion seccion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Espacio.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              seccion.icono,
              size: Espacio.xxxl,
              color: tema.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: Espacio.lg),
            Text(seccion.titulo, style: tema.textTheme.titleMedium),
            const SizedBox(height: Espacio.xs),
            Text(
              'Todavía no está disponible en esta versión.',
              textAlign: TextAlign.center,
              style: tema.textTheme.bodyMedium?.copyWith(
                color: tema.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
