import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/tema/tema_app.dart';
import 'agrupar.dart';
import 'estados.dart';
import 'ficha_incidente.dart';
import 'filtros_mapa.dart';
import 'foco_mapa.dart';
import 'lista_incidentes.dart';
import 'modelos.dart';
import 'referencias_mapa.dart';
import 'repositorio_mapa.dart';
import 'ubicacion.dart';

/// Centro de Neuquén capital, el mismo que en la web.
const centroInicial = LatLng(-38.9516, -68.0591);
const _zoomInicial = 14.0;
const _zoomUbicacion = 16.0;
const _zoomFoco = 17.0;

/// Mapa público de incidentes (F03), con filtros y ficha. Se ve con o sin
/// sesión: lo usan la pantalla del visitante y la principal.
class MapaIncidentes extends ConsumerStatefulWidget {
  const MapaIncidentes({super.key});

  @override
  ConsumerState<MapaIncidentes> createState() => _MapaIncidentesState();
}

class _MapaIncidentesState extends ConsumerState<MapaIncidentes> {
  final _controlador = MapController();
  var _filtros = const FiltrosMapa();
  Rectangulo? _vista;
  Timer? _espera;
  var _movidoPorLaPersona = false;

  /// Lo último que llegó del servidor. Null hasta la primera respuesta.
  List<PuntoMapa>? _puntos;
  Agrupador _agrupar = crearAgrupador(const []);

  @override
  void dispose() {
    _espera?.cancel();
    _controlador.dispose();
    super.dispose();
  }

  void _alEstarListo() {
    _actualizarVista();
    _centrarEnUbicacion();
  }

  void _alMover(MapCamera _, bool porGesto) {
    if (porGesto) _movidoPorLaPersona = true;
    // Se piden los puntos cuando el mapa se queda quieto, no en cada cuadro
    // del movimiento.
    _espera?.cancel();
    _espera = Timer(const Duration(milliseconds: 300), _actualizarVista);
  }

  void _actualizarVista() {
    final limites = _controlador.camera.visibleBounds;
    final vista = Rectangulo.paraConsulta(
      oeste: limites.west,
      sur: limites.south,
      este: limites.east,
      norte: limites.north,
    );
    if (mounted && vista != _vista) setState(() => _vista = vista);
  }

  Future<void> _centrarEnUbicacion() async {
    final posicion = await ref.read(ubicacionProvider).actual();
    // Si mientras tanto la persona ya movió el mapa, no se lo cambiamos.
    if (!mounted || posicion == null || _movidoPorLaPersona) return;
    _controlador.move(posicion, _zoomUbicacion);
  }

  Future<void> _abrirFiltros() async {
    final filtros = await elegirFiltros(context, _filtros);
    if (filtros != null && mounted) setState(() => _filtros = filtros);
  }

  @override
  Widget build(BuildContext context) {
    // Otra pantalla pide mostrar un punto (un reporte recién enviado): se
    // muestra aunque la persona haya movido el mapa.
    ref.listen(focoMapaProvider, (_, punto) {
      if (punto == null) return;
      _movidoPorLaPersona = true;
      _controlador.move(punto, _zoomFoco);
      ref.read(focoMapaProvider.notifier).limpiar();
    });

    final vista = _vista;
    final consulta = vista == null ? null : (filtros: _filtros, vista: vista);
    final incidentes = consulta == null
        ? null
        : ref.watch(incidentesProvider(consulta));

    // Mientras llegan los puntos de la vista nueva se siguen dibujando los
    // anteriores: así el mapa no parpadea al moverlo.
    if (incidentes?.value case final puntos? when !identical(puntos, _puntos)) {
      _puntos = puntos;
      _agrupar = crearAgrupador(puntos);
    }

    final cargando = incidentes == null || incidentes.isLoading;
    final error = cargando ? null : incidentes.error;
    final vacio = !cargando && error == null && _puntos!.isEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Barra(
          texto: switch (_puntos?.length) {
            null => error == null ? 'Cargando…' : '',
            1 => '1 incidente en esta zona',
            final n => '$n incidentes en esta zona',
          },
          filtrosActivos: _filtros.cantidadActivos,
          alAbrirFiltros: _abrirFiltros,
        ),
        if (error != null)
          _AvisoError(
            mensaje: ErrorApi.desde(error).mensaje,
            alReintentar: () => ref.invalidate(incidentesProvider(consulta!)),
          ),
        Expanded(
          child: Stack(
            children: [
              FlutterMap(
                mapController: _controlador,
                options: MapOptions(
                  initialCenter: centroInicial,
                  initialZoom: _zoomInicial,
                  minZoom: 3,
                  maxZoom: zoomMaximo.toDouble(),
                  // Sin rotar, el rectángulo visible es el que se pide.
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                  ),
                  onMapReady: _alEstarListo,
                  onPositionChanged: _alMover,
                ),
                children: [
                  const CapaOsm(),
                  _Marcadores(
                    agrupar: _agrupar,
                    alTocarGrupo: (grupo) => _controlador.move(
                      grupo.posicion,
                      grupo.zoomParaAbrir.toDouble(),
                    ),
                  ),
                  const AtribucionOsm(),
                ],
              ),
              if (cargando)
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(),
                ),
              if (vacio)
                Positioned(
                  top: Espacio.md,
                  left: Espacio.md,
                  right: Espacio.md,
                  child: _AvisoVacio(
                    conFiltros: _filtros.cantidadActivos > 0,
                    alLimpiar: () =>
                        setState(() => _filtros = const FiltrosMapa()),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({
    required this.texto,
    required this.filtrosActivos,
    required this.alAbrirFiltros,
  });

  final String texto;
  final int filtrosActivos;
  final VoidCallback alAbrirFiltros;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tema.colorScheme.surface,
        border: Border(bottom: BorderSide(color: tema.colorScheme.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Espacio.lg,
          vertical: Espacio.xs,
        ),
        child: Row(
          children: [
            Expanded(
              child: Semantics(
                liveRegion: true,
                child: Text(
                  texto,
                  maxLines: 2,
                  style: tema.textTheme.bodySmall?.copyWith(
                    color: tema.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
            // Ícono para que la barra entre en un celular angosto aun con la
            // letra agrandada; TalkBack lo lee como «Referencias».
            IconButton(
              tooltip: 'Referencias',
              icon: const Icon(Icons.info_outline),
              onPressed: () => mostrarReferencias(context),
            ),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: Espacio.md),
              ),
              onPressed: alAbrirFiltros,
              icon: const Icon(Icons.filter_list),
              label: Text(
                filtrosActivos == 0 ? 'Filtros' : 'Filtros ($filtrosActivos)',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Dibuja lo que corresponde a la vista actual. Se vuelve a armar con cada
/// cambio de la cámara: acercar o alejar reagrupa en el momento.
class _Marcadores extends StatelessWidget {
  const _Marcadores({required this.agrupar, required this.alTocarGrupo});

  final Agrupador agrupar;
  final ValueChanged<Grupo> alTocarGrupo;

  @override
  Widget build(BuildContext context) {
    final camara = MapCamera.of(context);
    final limites = camara.visibleBounds;
    // El mismo rectángulo que se le pide al servidor: se dibuja todo lo que se
    // cuenta, también lo que cae justo en el borde.
    final elementos = agrupar(
      Rectangulo.paraConsulta(
        oeste: limites.west,
        sur: limites.south,
        este: limites.east,
        norte: limites.north,
      ),
      camara.zoom,
    );

    return MarkerLayer(
      markers: [
        for (final elemento in elementos)
          switch (elemento) {
            PuntoSuelto(:final punto) => Marker(
              point: elemento.posicion,
              width: altoTactil,
              height: altoTactil,
              child: _Tocable(
                etiqueta: '${punto.categoriaNombre}, ${punto.estado.etiqueta}',
                alTocar: () => mostrarFicha(context, punto.id),
                child: MarcaEstado(punto.estado),
              ),
            ),
            Grupo(:final cantidad) => Marker(
              point: elemento.posicion,
              width: 56,
              height: 56,
              child: _Tocable(
                etiqueta: '$cantidad incidentes juntos. Tocá para acercar.',
                alTocar: () => alTocarGrupo(elemento),
                child: MarcaGrupo(cantidad),
              ),
            ),
            Superpuestos(:final puntos) => Marker(
              point: elemento.posicion,
              width: 56,
              height: 56,
              child: _Tocable(
                etiqueta:
                    '${puntos.length} incidentes en el mismo lugar. Tocá '
                    'para ver la lista.',
                alTocar: () => mostrarListaIncidentes(context, puntos),
                child: MarcaGrupo(puntos.length),
              ),
            ),
          },
      ],
    );
  }
}

/// El área táctil (48 dp o más) es más grande que el círculo que se ve.
class _Tocable extends StatelessWidget {
  const _Tocable({
    required this.etiqueta,
    required this.alTocar,
    required this.child,
  });

  final String etiqueta;
  final VoidCallback alTocar;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // Nodo propio y con su acción, para que TalkBack lo lea solo y lo pueda
    // activar.
    return Semantics(
      container: true,
      button: true,
      label: etiqueta,
      onTap: alTocar,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: alTocar,
        child: Center(child: child),
      ),
    );
  }
}

class _AvisoError extends StatelessWidget {
  const _AvisoError({required this.mensaje, required this.alReintentar});

  final String mensaje;
  final VoidCallback alReintentar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        Espacio.lg,
        Espacio.md,
        Espacio.lg,
        Espacio.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          MensajeError(mensaje),
          const SizedBox(height: Espacio.sm),
          OutlinedButton(
            onPressed: alReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}

class _AvisoVacio extends StatelessWidget {
  const _AvisoVacio({required this.conFiltros, required this.alLimpiar});

  final bool conFiltros;
  final VoidCallback alLimpiar;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tema.colorScheme.surface,
        border: Border.all(color: tema.colorScheme.outline),
        borderRadius: BorderRadius.circular(radioBorde),
      ),
      child: Padding(
        padding: const EdgeInsets.all(Espacio.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              conFiltros
                  ? 'No hay incidentes en esta zona con estos filtros. Mové '
                        'el mapa o cambiá los filtros.'
                  : 'No hay incidentes en esta zona. Mové el mapa para ver '
                        'otra.',
            ),
            if (conFiltros)
              TextButton(
                onPressed: alLimpiar,
                child: const Text('Limpiar filtros'),
              ),
          ],
        ),
      ),
    );
  }
}
