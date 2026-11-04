import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/mapa_incidentes.dart';
import '../mapa/ubicacion.dart';
import '../reportar/pantalla_elegir_punto.dart';
import 'buscar_lugar.dart';
import 'modelos.dart';
import 'repositorio_recorrido.dart';

enum _Forma { ubicacion, mapa, direccion }

/// Recorrido peatonal accesible (F11): origen, destino y perfil de movilidad.
/// El servidor calcula el camino que evita lo intransitable para ese perfil;
/// cambiar el perfil vuelve a pedirlo.
class PantallaRecorrido extends ConsumerStatefulWidget {
  const PantallaRecorrido({super.key});

  @override
  ConsumerState<PantallaRecorrido> createState() => _PantallaRecorridoState();
}

class _PantallaRecorridoState extends ConsumerState<PantallaRecorrido> {
  final _controlador = MapController();
  var _mapaListo = false;
  PuntoElegido? _origen;
  PuntoElegido? _destino;

  /// El que eligió en esta pantalla. Mientras sea null vale el del usuario.
  int? _perfilElegido;
  var _buscandoUbicacion = false;
  String? _avisoUbicacion;

  /// El último recorrido que se encuadró en el mapa.
  Recorrido? _encuadrado;

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  List<ZonaPiloto> get _zonas => ref.read(zonasPilotoProvider).value ?? [];

  void _alEstarListo() {
    _mapaListo = true;
    _encuadrarZona();
  }

  void _encuadrarZona() {
    final puntos = [for (final zona in _zonas) ...zona.contorno];
    if (_mapaListo && puntos.isNotEmpty) _encuadrar(puntos);
  }

  void _encuadrar(List<LatLng> puntos) {
    _controlador.fitCamera(
      CameraFit.coordinates(
        coordinates: puntos,
        padding: const EdgeInsets.all(Espacio.xxl),
        maxZoom: 18,
      ),
    );
  }

  /// Donde arranca el mapa para marcar un punto: el ya elegido o la zona.
  LatLng _inicioParaMarcar(PuntoElegido? actual) {
    if (actual != null) return actual.punto;
    final puntos = [for (final zona in _zonas) ...zona.contorno];
    if (puntos.isEmpty) return centroInicial;
    return LatLngBounds.fromPoints(puntos).center;
  }

  Future<void> _elegir({required bool esOrigen}) async {
    final forma = await showModalBottomSheet<_Forma>(
      context: context,
      showDragHandle: true,
      builder: (contexto) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Espacio.lg),
              child: Text(
                esOrigen ? '¿Desde dónde salís?' : '¿A dónde vas?',
                style: Theme.of(contexto).textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: Espacio.sm),
            if (esOrigen)
              ListTile(
                leading: const Icon(Icons.my_location),
                title: const Text('Mi ubicación actual'),
                onTap: () => Navigator.of(contexto).pop(_Forma.ubicacion),
              ),
            ListTile(
              leading: const Icon(Icons.pin_drop_outlined),
              title: const Text('Marcar en el mapa'),
              onTap: () => Navigator.of(contexto).pop(_Forma.mapa),
            ),
            ListTile(
              leading: const Icon(Icons.search),
              title: const Text('Buscar una dirección'),
              onTap: () => Navigator.of(contexto).pop(_Forma.direccion),
            ),
          ],
        ),
      ),
    );
    if (forma == null || !mounted) return;

    final elegido = switch (forma) {
      _Forma.ubicacion => await _ubicacionActual(),
      _Forma.mapa => await _marcarEnMapa(esOrigen: esOrigen),
      _Forma.direccion => await _buscarDireccion(esOrigen: esOrigen),
    };
    if (elegido == null || !mounted) return;
    setState(() => esOrigen ? _origen = elegido : _destino = elegido);
  }

  Future<PuntoElegido?> _ubicacionActual() async {
    setState(() {
      _buscandoUbicacion = true;
      _avisoUbicacion = null;
    });
    final posicion = await ref.read(ubicacionProvider).actual();
    if (!mounted) return null;
    setState(() {
      _buscandoUbicacion = false;
      if (posicion == null) {
        _avisoUbicacion =
            'No pudimos leer tu ubicación. Revisá que esté activada y que '
            'SnapIt tenga permiso, o marcá el punto en el mapa.';
      }
    });
    return posicion == null ? null : PuntoElegido(posicion, 'Tu ubicación');
  }

  Future<PuntoElegido?> _marcarEnMapa({required bool esOrigen}) async {
    final lugar = esOrigen ? 'desde dónde salís' : 'a dónde vas';
    final punto = await context.push<LatLng>(
      Rutas.elegirPunto,
      extra: PedidoPunto(
        _inicioParaMarcar(esOrigen ? _origen : _destino),
        TextosElegirPunto(
          titulo: esOrigen ? 'Punto de partida' : 'Destino',
          mapa: 'Mapa. Arrastralo para marcar $lugar.',
          indicacion:
              'Mové el mapa hasta que el pin quede $lugar. Los recorridos se '
              'calculan dentro de la zona marcada.',
        ),
        zonas: [for (final zona in _zonas) zona.contorno],
      ),
    );
    return punto == null
        ? null
        : PuntoElegido(punto, 'Punto marcado en el mapa');
  }

  Future<PuntoElegido?> _buscarDireccion({required bool esOrigen}) async {
    final lugar = await buscarLugar(
      context,
      titulo: esOrigen ? 'Buscar el punto de partida' : 'Buscar el destino',
    );
    return lugar == null ? null : PuntoElegido(lugar.punto, lugar.nombre);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(zonasPilotoProvider, (_, _) => _encuadrarZona());

    final zonas = ref.watch(zonasPilotoProvider);
    final perfiles = ref.watch(perfilesProvider);
    final delUsuario = ref.watch(
      sesionProvider.select((sesion) => sesion.value?.perfilMovilidadId),
    );
    final lista = perfiles.value ?? const <PerfilMovilidad>[];
    // El del usuario vale solo si sigue activo.
    final perfilId =
        _perfilElegido ??
        (lista.any((perfil) => perfil.id == delUsuario) ? delUsuario : null);

    final (origen, destino) = (_origen, _destino);
    final consulta = origen == null || destino == null || perfilId == null
        ? null
        : (origen: origen.punto, destino: destino.punto, perfilId: perfilId);
    final recorrido = consulta == null
        ? null
        : ref.watch(recorridoProvider(consulta));
    final camino = recorrido?.value;

    // Cada recorrido nuevo se encuadra una vez; después la persona mueve el
    // mapa como quiera.
    if (camino != null && !identical(camino, _encuadrado) && _mapaListo) {
      _encuadrado = camino;
      final puntos = [...camino.traza, origen!.punto, destino!.punto];
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _encuadrar(puntos);
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Panel(
          origen: _origen,
          destino: _destino,
          buscandoUbicacion: _buscandoUbicacion,
          avisoUbicacion: _avisoUbicacion,
          alElegirOrigen: () => _elegir(esOrigen: true),
          alElegirDestino: () => _elegir(esOrigen: false),
          perfiles: perfiles,
          perfilId: perfilId,
          alElegirPerfil: (id) => setState(() => _perfilElegido = id),
          alReintentarPerfiles: () => ref.invalidate(perfilesProvider),
          resultado: _Resultado(
            recorrido: recorrido,
            falta: _queFalta(perfilId),
            alReintentar: consulta == null
                ? null
                : () => ref.invalidate(recorridoProvider(consulta)),
          ),
        ),
        if (zonas.hasError)
          Padding(
            padding: const EdgeInsets.all(Espacio.md),
            child: MensajeError(
              'No se pudo cargar la zona piloto: '
              '${ErrorApi.desde(zonas.error!).mensaje}',
            ),
          ),
        Expanded(
          child: Stack(
            children: [
              Semantics(
                label:
                    'Mapa del recorrido. La zona piloto, donde se pueden '
                    'pedir recorridos, tiene borde gris.',
                child: FlutterMap(
                  mapController: _controlador,
                  options: MapOptions(
                    initialCenter: centroInicial,
                    initialZoom: 14,
                    minZoom: 12,
                    maxZoom: 19,
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                    ),
                    onMapReady: _alEstarListo,
                  ),
                  children: [
                    const CapaOsm(),
                    if (zonas.value case final zonas?)
                      CapaZonas([for (final zona in zonas) zona.contorno]),
                    if (camino != null)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: camino.traza,
                            color: Theme.of(context).colorScheme.primary,
                            strokeWidth: 6,
                          ),
                        ],
                      ),
                    MarkerLayer(
                      markers: [
                        if (origen != null)
                          _marca(origen.punto, Icons.trip_origin, 'Origen'),
                        if (destino != null)
                          _marca(destino.punto, Icons.place, 'Destino'),
                      ],
                    ),
                    const AtribucionOsm(),
                  ],
                ),
              ),
              if (recorrido?.isLoading ?? false)
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(),
                ),
            ],
          ),
        ),
      ],
    );
  }

  String? _queFalta(int? perfilId) {
    if (_origen == null && _destino == null) {
      return 'Elegí desde dónde salís y a dónde vas.';
    }
    if (_origen == null) return 'Elegí desde dónde salís.';
    if (_destino == null) return 'Elegí a dónde vas.';
    if (perfilId == null) {
      return 'Elegí tu perfil de movilidad para calcular el recorrido.';
    }
    return null;
  }

  Marker _marca(LatLng punto, IconData icono, String etiqueta) {
    final color = Theme.of(context).colorScheme.primary;
    return Marker(
      point: punto,
      width: altoTactil,
      height: altoTactil,
      // La punta del pin del destino toca el punto.
      alignment: icono == Icons.place ? Alignment.topCenter : Alignment.center,
      child: Semantics(
        label: etiqueta,
        child: Icon(icono, color: color, size: Espacio.xxl),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.origen,
    required this.destino,
    required this.buscandoUbicacion,
    required this.avisoUbicacion,
    required this.alElegirOrigen,
    required this.alElegirDestino,
    required this.perfiles,
    required this.perfilId,
    required this.alElegirPerfil,
    required this.alReintentarPerfiles,
    required this.resultado,
  });

  final PuntoElegido? origen;
  final PuntoElegido? destino;
  final bool buscandoUbicacion;
  final String? avisoUbicacion;
  final VoidCallback alElegirOrigen;
  final VoidCallback alElegirDestino;
  final AsyncValue<List<PerfilMovilidad>> perfiles;
  final int? perfilId;
  final ValueChanged<int> alElegirPerfil;
  final VoidCallback alReintentarPerfiles;
  final Widget resultado;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tema.colorScheme.surface,
        border: Border(bottom: BorderSide(color: tema.colorScheme.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(Espacio.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _CampoPunto(
              etiqueta: 'Desde',
              icono: Icons.trip_origin,
              punto: origen,
              vacio: buscandoUbicacion
                  ? 'Buscando tu ubicación…'
                  : 'Elegí desde dónde salís',
              alTocar: buscandoUbicacion ? null : alElegirOrigen,
            ),
            if (avisoUbicacion case final aviso?) ...[
              const SizedBox(height: Espacio.sm),
              MensajeError(aviso),
            ],
            const SizedBox(height: Espacio.sm),
            _CampoPunto(
              etiqueta: 'Hasta',
              icono: Icons.place_outlined,
              punto: destino,
              vacio: 'Elegí a dónde vas',
              alTocar: alElegirDestino,
            ),
            const SizedBox(height: Espacio.md),
            switch (perfiles) {
              AsyncValue(:final value?) => DropdownButtonFormField<int>(
                // El campo toma el valor solo al crearse: con otra clave se
                // vuelve a armar si el perfil cambia desde afuera.
                key: ValueKey(perfilId),
                initialValue: perfilId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Perfil de movilidad',
                ),
                hint: const Text('Elegí cómo te movés'),
                items: [
                  for (final perfil in value)
                    DropdownMenuItem(
                      value: perfil.id,
                      child: Text(perfil.nombre),
                    ),
                ],
                onChanged: (id) {
                  if (id != null) alElegirPerfil(id);
                },
              ),
              AsyncValue(:final error?) => Row(
                children: [
                  Expanded(
                    child: MensajeError(
                      'No se pudieron cargar los perfiles: '
                      '${ErrorApi.desde(error).mensaje}',
                    ),
                  ),
                  const SizedBox(width: Espacio.sm),
                  OutlinedButton(
                    onPressed: alReintentarPerfiles,
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
              _ => const LinearProgressIndicator(),
            },
            const SizedBox(height: Espacio.md),
            resultado,
          ],
        ),
      ),
    );
  }
}

/// Un campo que se toca para elegir el origen o el destino.
class _CampoPunto extends StatelessWidget {
  const _CampoPunto({
    required this.etiqueta,
    required this.icono,
    required this.punto,
    required this.vacio,
    required this.alTocar,
  });

  final String etiqueta;
  final IconData icono;
  final PuntoElegido? punto;
  final String vacio;
  final VoidCallback? alTocar;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final texto = punto?.descripcion ?? vacio;
    // Un solo nodo para TalkBack, con su acción: lee la etiqueta y lo elegido.
    return Semantics(
      button: true,
      enabled: alTocar != null,
      label: '$etiqueta: $texto',
      hint: punto == null ? null : 'Tocá para cambiarlo',
      onTap: alTocar,
      excludeSemantics: true,
      child: OutlinedButton(
        onPressed: alTocar,
        style: OutlinedButton.styleFrom(
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(
            horizontal: Espacio.md,
            vertical: Espacio.sm,
          ),
        ),
        child: Row(
          children: [
            Icon(icono),
            const SizedBox(width: Espacio.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    etiqueta,
                    style: tema.textTheme.bodySmall?.copyWith(
                      color: tema.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  Text(
                    texto,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: tema.textTheme.bodyLarge?.copyWith(
                      color: punto == null
                          ? tema.colorScheme.onSurfaceVariant
                          : tema.colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Resultado extends StatelessWidget {
  const _Resultado({
    required this.recorrido,
    required this.falta,
    required this.alReintentar,
  });

  final AsyncValue<Recorrido>? recorrido;

  /// Qué le falta elegir a la persona, si le falta algo.
  final String? falta;
  final VoidCallback? alReintentar;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    if (falta case final falta?) {
      return Text(
        falta,
        style: tema.textTheme.bodyMedium?.copyWith(
          color: tema.colorScheme.onSurfaceVariant,
        ),
      );
    }
    return Semantics(
      liveRegion: true,
      child: switch (recorrido) {
        AsyncValue(:final Recorrido value) => Row(
          children: [
            Icon(Icons.directions_walk, color: tema.colorScheme.primary),
            const SizedBox(width: Espacio.sm),
            Expanded(
              child: Text(
                '${value.distancia} · ${value.tiempo} caminando',
                style: tema.textTheme.titleMedium,
              ),
            ),
          ],
        ),
        AsyncValue(:final error?) => _ErrorRecorrido(
          ErrorApi.desde(error),
          alReintentar: alReintentar,
        ),
        _ => const Text('Calculando el recorrido…'),
      },
    );
  }
}

class _ErrorRecorrido extends StatelessWidget {
  const _ErrorRecorrido(this.error, {required this.alReintentar});

  final ErrorApi error;
  final VoidCallback? alReintentar;

  @override
  Widget build(BuildContext context) {
    // Fuera de la zona, sin camino o sin vereda cerca: reintentar daría lo
    // mismo, hay que cambiar un punto o el perfil.
    final sePuedeReintentar = error.status == null || error.status! >= 500;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        MensajeError(error.mensaje),
        if (sePuedeReintentar && alReintentar != null) ...[
          const SizedBox(height: Espacio.sm),
          OutlinedButton(
            onPressed: alReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ],
    );
  }
}
