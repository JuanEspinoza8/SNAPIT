import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/tema/tema_app.dart';

/// Lo que dice la pantalla según para qué se elige el punto.
class TextosElegirPunto {
  const TextosElegirPunto({
    required this.titulo,
    required this.mapa,
    required this.indicacion,
  });

  /// Corregir el punto de un reporte.
  static const problema = TextosElegirPunto(
    titulo: 'Mover el punto',
    mapa: 'Mapa. Arrastralo para elegir el lugar del problema.',
    indicacion: 'Mové el mapa hasta que el pin quede sobre el problema.',
  );

  final String titulo;

  /// Lo que lee TalkBack sobre el mapa.
  final String mapa;
  final String indicacion;
}

/// Lo que recibe `/elegir-punto` en `extra` cuando no es para un reporte.
class PedidoPunto {
  const PedidoPunto(this.inicial, this.textos, {this.zonas = const []});

  final LatLng inicial;
  final TextosElegirPunto textos;

  /// Contornos que se dibujan de referencia, por ejemplo la zona piloto.
  final List<List<LatLng>> zonas;
}

/// Mapa a pantalla completa para elegir un punto (corregir el del GPS en un
/// reporte, o el origen o el destino de un recorrido). El punto es siempre el
/// centro del mapa: se arrastra el mapa, no el pin, así el dedo no tapa el
/// lugar. Devuelve el punto elegido o null si se vuelve atrás.
class PantallaElegirPunto extends StatefulWidget {
  const PantallaElegirPunto({
    super.key,
    required this.inicial,
    this.textos = TextosElegirPunto.problema,
    this.zonas = const [],
  });

  final LatLng inicial;
  final TextosElegirPunto textos;
  final List<List<LatLng>> zonas;

  @override
  State<PantallaElegirPunto> createState() => _PantallaElegirPuntoState();
}

class _PantallaElegirPuntoState extends State<PantallaElegirPunto> {
  late LatLng _centro = widget.inicial;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(widget.textos.titulo)),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Semantics(
                    label: widget.textos.mapa,
                    child: FlutterMap(
                      options: MapOptions(
                        initialCenter: widget.inicial,
                        initialZoom: 18,
                        minZoom: 12,
                        maxZoom: 19,
                        interactionOptions: const InteractionOptions(
                          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                        ),
                        // No se redibuja nada: solo se recuerda el centro.
                        onPositionChanged: (camara, _) =>
                            _centro = camara.center,
                      ),
                      children: [
                        const CapaOsm(),
                        if (widget.zonas.isNotEmpty) CapaZonas(widget.zonas),
                        const AtribucionOsm(),
                      ],
                    ),
                  ),
                  // La punta del pin queda justo en el centro del mapa.
                  IgnorePointer(
                    child: Center(
                      child: Transform.translate(
                        offset: const Offset(0, -Espacio.xl),
                        child: Icon(
                          Icons.location_on,
                          size: Espacio.xxxl,
                          color: tema.colorScheme.primary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            DecoratedBox(
              decoration: BoxDecoration(
                color: tema.colorScheme.surface,
                border: Border(
                  top: BorderSide(color: tema.colorScheme.outline),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(Espacio.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(widget.textos.indicacion),
                    const SizedBox(height: Espacio.md),
                    FilledButton(
                      onPressed: () => context.pop(_centro),
                      child: const Text('Usar este punto'),
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
}
