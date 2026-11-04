import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/tema_app.dart';
import '../feed/pantalla_feed.dart';
import '../mapa/foco_mapa.dart';
import '../mapa/mapa_incidentes.dart';
import '../mis_reportes/pantalla_mis_reportes.dart';
import '../reportar/pantalla_reportar.dart';

/// Lo primero que se ve con sesión: el feed. El vecino tiene además mapa,
/// reportar y mis reportes; operador y administrador, inicio y mapa: la
/// gestión es en la web.
class PantallaPrincipal extends ConsumerStatefulWidget {
  const PantallaPrincipal({super.key});

  @override
  ConsumerState<PantallaPrincipal> createState() => _PantallaPrincipalState();
}

class _PantallaPrincipalState extends ConsumerState<PantallaPrincipal> {
  var _seccion = 0;

  // Reportar y Mis reportes se arman recién la primera vez que se abren.
  // Inicio y Mapa, desde el principio: el mapa ya tiene sus puntos al abrirlo.
  // Reportar pide la ubicación al aparecer, y si lo hiciera junto con el mapa,
  // Android rechaza el segundo pedido de permiso. Mis reportes no pide la
  // lista si el vecino nunca la mira.
  final _abiertas = {_inicio, _mapa};

  static const _inicio = 0;
  static const _mapa = 1;
  static const _reportar = 2;
  static const _misReportes = 3;

  static const _seccionesVecino = [
    _Seccion('Inicio', Icons.home_outlined, 'SnapIt'),
    _Seccion('Mapa', Icons.map_outlined, 'Mapa de incidentes'),
    _Seccion('Reportar', Icons.add_a_photo_outlined, 'Reportar un problema'),
    _Seccion('Mis reportes', Icons.list_alt_outlined, 'Mis reportes'),
  ];

  /// Operador y administrador: las dos primeras.
  static final _seccionesOrganismo = _seccionesVecino.sublist(0, 2);

  @override
  Widget build(BuildContext context) {
    final usuario = ref.watch(sesionProvider).value;
    // Sin sesión el router ya está llevando al ingreso.
    if (usuario == null) return const SizedBox.shrink();

    final esVecino = usuario.rol == Rol.vecino;
    final secciones = esVecino ? _seccionesVecino : _seccionesOrganismo;
    final seccion = secciones[_seccion];

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
        // Las secciones quedan vivas al cambiar de pestaña: el feed no pierde
        // por dónde iba, ni el mapa la zona y los filtros.
        child: IndexedStack(
          index: _seccion,
          children: [
            const PantallaFeed(),
            if (esVecino)
              const MapaIncidentes()
            else
              const Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _AvisoPanelWeb(),
                  Expanded(child: MapaIncidentes()),
                ],
              ),
            if (esVecino) ...[
              if (_abiertas.contains(_reportar))
                PantallaReportar(alVerEnMapa: _verEnMapa)
              else
                const SizedBox.shrink(),
              if (_abiertas.contains(_misReportes))
                PantallaMisReportes(alReportar: () => _abrir(_reportar))
              else
                const SizedBox.shrink(),
            ],
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _seccion,
        onDestinationSelected: _abrir,
        destinations: [
          for (final s in secciones)
            NavigationDestination(icon: Icon(s.icono), label: s.nombre),
        ],
      ),
    );
  }

  void _abrir(int seccion) => setState(() {
    _seccion = seccion;
    _abiertas.add(seccion);
  });

  void _verEnMapa(LatLng punto) {
    _abrir(_mapa);
    ref.read(focoMapaProvider.notifier).enfocar(punto);
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
