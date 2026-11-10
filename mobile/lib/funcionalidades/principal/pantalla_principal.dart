import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/almacen_sesion.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/modo_tema.dart';
import '../../compartido/tema/tema_app.dart';
import '../avisos/avisos.dart';
import '../avisos/avisos_pospuestos.dart';
import '../avisos/modelos.dart';
import '../avisos/repositorio_avisos.dart';
import '../avisos/servicio_push.dart';
import '../feed/pantalla_feed.dart';
import '../mapa/foco_mapa.dart';
import '../mapa/mapa_incidentes.dart';
import '../mapa/repositorio_mapa.dart';
import '../mis_reportes/pantalla_mis_reportes.dart';
import '../recorrido/elegir_perfil_movilidad.dart';
import '../recorrido/pantalla_recorrido.dart';
import '../reportar/pantalla_reportar.dart';

/// Lo primero que se ve con sesión: el feed. El vecino tiene además mapa,
/// reportar, mis reportes y recorrido; operador y administrador, inicio y
/// mapa: la gestión es en la web.
class PantallaPrincipal extends ConsumerStatefulWidget {
  const PantallaPrincipal({super.key});

  @override
  ConsumerState<PantallaPrincipal> createState() => _PantallaPrincipalState();
}

class _PantallaPrincipalState extends ConsumerState<PantallaPrincipal> {
  var _seccion = 0;

  StreamSubscription<String>? _tokensPush;
  StreamSubscription<MensajePush>? _avisosRecibidos;
  StreamSubscription<MensajePush>? _avisosAbiertos;
  late final AppLifecycleListener _ciclo;

  // Al abrir la app cerrada desde una notificación, el aviso llega dos veces:
  // como mensaje inicial y como aviso tocado. Se abre una sola.
  final _avisosYaAbiertos = <int>{};

  // Todas menos Inicio se arman recién la primera vez que se abren. El mapa y
  // Reportar piden la ubicación al aparecer: armados de entrada, el permiso
  // saltaría encima del feed, sin que se entienda para qué es. Además, si los
  // dos lo pidieran juntos, Android rechaza el segundo pedido. Las otras no
  // piden nada si el vecino nunca las mira.
  final _abiertas = {_inicio};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _iniciarAvisos());
    // Un aviso que llega con la app en segundo plano lo muestra Android y la
    // app no se entera: al volver, se pide la lista de nuevo para que el
    // contador no quede viejo.
    _ciclo = AppLifecycleListener(
      onResume: () {
        if (mounted && _esVecino) ref.invalidate(avisosProvider);
      },
    );
  }

  @override
  void dispose() {
    _tokensPush?.cancel();
    _avisosRecibidos?.cancel();
    _avisosAbiertos?.cancel();
    _ciclo.dispose();
    super.dispose();
  }

  // Los avisos (F10) son solo para vecinos: a un operador o a un
  // administrador nunca le llega uno.
  bool get _esVecino => ref.read(sesionProvider).value?.rol == Rol.vecino;

  /// Registra este celular para recibir avisos, lo vuelve a registrar cada
  /// vez que FCM renueva el token y queda atento a los avisos que llegan o
  /// que el usuario toca.
  Future<void> _iniciarAvisos() async {
    if (!mounted || !_esVecino) return;
    final push = ref.read(servicioPushProvider);
    _avisosRecibidos = push.recibidos.listen(_mostrarAviso);
    _avisosAbiertos = push.abiertos.listen(_abrirAviso);
    _tokensPush = push.tokensRenovados.listen((_) => _registrarTokenPush());

    // Primero el aviso que abrió la app desde cero, si lo hubo: registrar el
    // celular espera al servidor y, con mala señal, demoraría la ficha.
    final inicial = await push.mensajeInicial();
    if (!mounted) return;
    if (inicial != null) _abrirAviso(inicial);
    await _pedirPermisoAvisos();
    if (!mounted) return;
    await _registrarTokenPush();
  }

  /// Con la app abierta el sistema no muestra la notificación: se muestra acá
  /// y se actualiza el contador de la barra superior.
  void _mostrarAviso(MensajePush mensaje) {
    if (!mounted) return;
    final partes = [
      mensaje.titulo,
      mensaje.cuerpo,
    ].whereType<String>().where((texto) => texto.isNotEmpty).toList();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            partes.isEmpty ? 'Tenés un aviso nuevo' : partes.join('\n'),
          ),
          duration: const Duration(seconds: 6),
          action: SnackBarAction(
            label: 'Ver',
            onPressed: () => _abrirAviso(mensaje),
          ),
        ),
      );
    ref.invalidate(avisosProvider);
    // Si la ficha de ese incidente está abierta, que muestre el cambio.
    if (mensaje.incidenteId case final id?) ref.invalidate(fichaProvider(id));
  }

  /// Abre la ficha del incidente (o la lista, si el aviso no es de uno) y lo
  /// marca como leído.
  void _abrirAviso(MensajePush mensaje) {
    if (!mounted) return;
    if (mensaje.notificacionId case final id? when !_avisosYaAbiertos.add(id)) {
      return;
    }
    if (mensaje.incidenteId case final id?) {
      // Si la ficha ya estaba abierta más abajo, se pide de nuevo: el aviso
      // es justamente de un cambio.
      ref.invalidate(fichaProvider(id));
      context.push(Rutas.incidente(id));
    } else {
      context.push(Rutas.avisos);
    }
    if (mensaje.notificacionId case final id?) {
      unawaited(_marcarLeido(id));
    }
  }

  Future<void> _marcarLeido(int id) async {
    try {
      await ref.read(repositorioAvisosProvider).marcarLeida(id);
      if (mounted) ref.invalidate(avisosProvider);
    } catch (error, pila) {
      developer.log(
        'No se pudo marcar el aviso como leído',
        name: 'avisos',
        error: error,
        stackTrace: pila,
      );
    }
  }

  /// En Android 13 o superior, explica para qué son los avisos antes de
  /// disparar el pedido de permiso del sistema. Si el vecino dijo «Ahora no»,
  /// no se le vuelve a preguntar al abrir la app.
  Future<void> _pedirPermisoAvisos() async {
    final push = ref.read(servicioPushProvider);
    final pospuestos = ref.read(avisosPospuestosProvider);
    if (await push.estadoPermiso() != EstadoPermiso.noDeterminado) return;
    if (await pospuestos.leer()) return;
    if (!mounted) return;

    final activar = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: const Text('Activá los avisos'),
        content: const Text(
          'Así te enteramos cuando avanza un reporte, se cierra un incidente '
          'o aparece uno nuevo en tus zonas. Los podés activar o apagar '
          'cuando quieras desde «Avisos y zonas», en tu cuenta.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(contexto).pop(false),
            child: const Text('Ahora no'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(contexto).pop(true),
            child: const Text('Activar'),
          ),
        ],
      ),
    );
    if (activar == true) {
      await push.pedirPermiso();
    } else if (activar == false) {
      await pospuestos.guardar();
    }
  }

  Future<void> _registrarTokenPush() async {
    if (!mounted) return;
    final push = ref.read(servicioPushProvider);
    final almacen = ref.read(almacenSesionProvider);
    final repositorio = ref.read(repositorioAvisosProvider);
    try {
      final token = await push.token();
      if (token == null || token.isEmpty) return;
      if (kDebugMode) {
        // Sirve para probar desde la consola de Firebase, sin el servidor.
        developer.log('Token de avisos del celular: $token', name: 'avisos');
      }
      // Se guarda también para mandarlo al salir y dar de baja el celular.
      await almacen.guardarTokenPush(token);
      await repositorio.registrarDispositivo(token);
    } catch (error, pila) {
      developer.log(
        'No se pudo registrar el celular para los avisos',
        name: 'avisos',
        error: error,
        stackTrace: pila,
      );
    }
  }

  static const _inicio = 0;
  static const _mapa = 1;
  static const _reportar = 2;
  static const _misReportes = 3;
  static const _recorrido = 4;

  static const _seccionesVecino = [
    _Seccion('Inicio', Icons.home_outlined, 'SnapIt'),
    _Seccion('Mapa', Icons.map_outlined, 'Mapa de incidentes'),
    _Seccion('Reportar', Icons.add_a_photo_outlined, 'Reportar un problema'),
    _Seccion('Mis reportes', Icons.list_alt_outlined, 'Mis reportes'),
    _Seccion('Recorrido', Icons.route_outlined, 'Recorrido accesible'),
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
    final noLeidos = esVecino ? ref.watch(avisosNoLeidosProvider) : 0;

    return Scaffold(
      appBar: AppBar(
        // En el inicio va el logo; en las demás secciones, su nombre.
        title: _seccion == _inicio
            ? Semantics(
                header: true,
                label: 'SnapIt',
                child: Image.asset(
                  'assets/logo.png',
                  height: 32,
                  excludeFromSemantics: true,
                ),
              )
            : Text(seccion.titulo),
        actions: [
          if (esVecino)
            IconButton(
              tooltip: noLeidos > 0 ? 'Avisos ($noLeidos sin leer)' : 'Avisos',
              icon: Badge(
                isLabelVisible: noLeidos > 0,
                label: Text(noLeidos > 99 ? '99+' : '$noLeidos'),
                child: const Icon(Icons.notifications_outlined),
              ),
              onPressed: () {
                // Al abrir la lista conviene traer lo último, no lo que se
                // cargó cuando arrancó la app.
                ref.invalidate(avisosProvider);
                context.push(Rutas.avisos);
              },
            ),
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
            if (!_abiertas.contains(_mapa))
              const SizedBox.shrink()
            else if (esVecino)
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
              if (_abiertas.contains(_recorrido))
                const PantallaRecorrido()
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
      isScrollControlled: true,
      builder: (contexto) => SafeArea(
        child: SingleChildScrollView(
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
              const SizedBox(height: Espacio.lg),
              Consumer(
                builder: (_, ref, _) => SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  secondary: const Icon(Icons.dark_mode_outlined),
                  title: const Text('Tema oscuro'),
                  value: ref.watch(modoTemaProvider) == ThemeMode.dark,
                  onChanged: (oscuro) => ref
                      .read(modoTemaProvider.notifier)
                      .elegir(oscuro: oscuro),
                ),
              ),
              if (usuario.rol == Rol.vecino) ...[
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.notifications_outlined),
                  title: const Text('Avisos y zonas'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(contexto).pop();
                    context.push(Rutas.ajustesAvisos);
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.directions_walk),
                  title: const Text('Perfil de movilidad'),
                  subtitle: const Text(
                    'Elegí cómo te movés en los recorridos.',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => mostrarElegirPerfilMovilidad(contexto),
                ),
              ],
              const SizedBox(height: Espacio.lg),
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
