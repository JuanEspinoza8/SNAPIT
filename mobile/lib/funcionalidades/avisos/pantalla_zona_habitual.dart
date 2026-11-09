import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/mapa_incidentes.dart';
import '../mapa/ubicacion.dart';
import 'avisos.dart';
import 'modelos.dart';
import 'repositorio_avisos.dart';

class PantallaZonaHabitual extends ConsumerStatefulWidget {
  const PantallaZonaHabitual({super.key, this.zona});

  final ZonaHabitual? zona;

  @override
  ConsumerState<PantallaZonaHabitual> createState() =>
      _PantallaZonaHabitualState();
}

class _PantallaZonaHabitualState extends ConsumerState<PantallaZonaHabitual> {
  static const _radioMin = 100.0;
  static const _radioMax = 5000.0;
  static const _zoom = 16.0;

  final _form = GlobalKey<FormState>();
  final _controlador = MapController();
  late final TextEditingController _nombre;
  late LatLng _centro;
  late double _radio;
  var _guardando = false;
  var _mapaListo = false;
  var _eligioCentro = false;
  LatLng? _ubicacionPendiente;

  bool get _editando => widget.zona != null;

  @override
  void initState() {
    super.initState();
    _nombre = TextEditingController(text: widget.zona?.nombre ?? '');
    _centro = widget.zona?.centro ?? centroInicial;
    _radio = (widget.zona?.radioMetros ?? 300)
        .clamp(_radioMin, _radioMax)
        .toDouble();
    if (!_editando) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _usarUbicacion(avisar: false);
      });
    }
  }

  @override
  void dispose() {
    _nombre.dispose();
    _controlador.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(_editando ? 'Editar zona' : 'Nueva zona')),
      body: SafeArea(
        child: ListView(
          children: [
            SizedBox(
              height: 320,
              child: Semantics(
                label:
                    'Mapa para elegir el centro y el radio de la zona habitual',
                child: FlutterMap(
                  mapController: _controlador,
                  options: MapOptions(
                    initialCenter: _centro,
                    initialZoom: _zoom,
                    minZoom: 12,
                    maxZoom: 19,
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                    ),
                    onMapReady: _alEstarListo,
                    onTap: (_, punto) {
                      FocusScope.of(context).unfocus();
                      setState(() {
                        _centro = punto;
                        _eligioCentro = true;
                      });
                    },
                  ),
                  children: [
                    const CapaOsm(),
                    CircleLayer(
                      circles: [
                        CircleMarker(
                          point: _centro,
                          radius: _radio,
                          useRadiusInMeter: true,
                          color: tema.colorScheme.primary.withValues(
                            alpha: 0.18,
                          ),
                          borderColor: tema.colorScheme.primary,
                          borderStrokeWidth: 2,
                        ),
                        CircleMarker(
                          point: _centro,
                          radius: 6,
                          color: tema.colorScheme.primary,
                          borderColor: tema.colorScheme.primary,
                          borderStrokeWidth: 1,
                        ),
                      ],
                    ),
                    const AtribucionOsm(),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(Espacio.lg),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Tocá el mapa para mover el centro de la zona.',
                      style: tema.textTheme.bodyMedium?.copyWith(
                        color: tema.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: Espacio.md),
                    TextFormField(
                      controller: _nombre,
                      maxLength: 80,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.done,
                      decoration: const InputDecoration(
                        labelText: 'Nombre de la zona',
                        hintText: 'Casa',
                      ),
                      validator: (valor) => (valor?.trim().isEmpty ?? true)
                          ? 'Poné un nombre.'
                          : null,
                    ),
                    const SizedBox(height: Espacio.md),
                    Row(
                      children: [
                        const Text('Radio'),
                        Expanded(
                          child: Slider(
                            value: _radio,
                            min: _radioMin,
                            max: _radioMax,
                            divisions: ((_radioMax - _radioMin) / 100).round(),
                            label: '${_radio.round()} m',
                            onChanged: (valor) =>
                                setState(() => _radio = valor),
                          ),
                        ),
                        SizedBox(
                          width: 64,
                          child: Text(
                            '${_radio.round()} m',
                            textAlign: TextAlign.end,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Espacio.sm),
                    OutlinedButton.icon(
                      onPressed: _guardando ? null : () => _usarUbicacion(),
                      icon: const Icon(Icons.my_location),
                      label: const Text('Usar mi ubicación'),
                    ),
                    const SizedBox(height: Espacio.md),
                    FilledButton(
                      onPressed: _guardando ? null : _guardar,
                      child: _guardando
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(_editando ? 'Guardar cambios' : 'Crear zona'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _alEstarListo() {
    _mapaListo = true;
    _moverAUbicacionPendiente();
  }

  void _moverAUbicacionPendiente() {
    final punto = _ubicacionPendiente;
    if (!_mapaListo || punto == null) return;
    _ubicacionPendiente = null;
    _controlador.move(punto, _zoom);
  }

  Future<void> _usarUbicacion({bool avisar = true}) async {
    final punto = await ref.read(ubicacionProvider).actual();
    if (!mounted) return;

    if (punto == null) {
      if (avisar) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            const SnackBar(content: Text('No se pudo leer la ubicación.')),
          );
      }
      return;
    }

    if (!avisar && _eligioCentro) return;

    setState(() => _centro = punto);
    _ubicacionPendiente = punto;
    _moverAUbicacionPendiente();
  }

  Future<void> _guardar() async {
    if (!(_form.currentState?.validate() ?? false)) return;

    FocusScope.of(context).unfocus();
    setState(() => _guardando = true);

    final datos = DatosZona(
      nombre: _nombre.text.trim(),
      centro: _centro,
      radioMetros: _radio.round(),
      activa: widget.zona?.activa ?? true,
    );

    try {
      final repositorio = ref.read(repositorioAvisosProvider);
      if (widget.zona case final zona?) {
        await repositorio.actualizarZona(zona.id, datos);
      } else {
        await repositorio.crearZona(datos);
      }
      ref.invalidate(zonasHabitualesProvider);
      if (mounted) context.pop();
    } catch (error) {
      if (mounted) mostrarError(context, error);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }
}
