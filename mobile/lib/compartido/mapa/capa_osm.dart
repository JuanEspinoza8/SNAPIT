import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../tema/tema_app.dart';

/// Fondo de OpenStreetMap, el mismo que usa la web.
class CapaOsm extends StatelessWidget {
  const CapaOsm({super.key});

  @override
  Widget build(BuildContext context) {
    return TileLayer(
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      // La política de uso de OpenStreetMap pide identificar la app.
      userAgentPackageName: 'ar.edu.uncoma.fi.snapit',
    );
  }
}

/// La atribución que pide OpenStreetMap, corta para que entre en cualquier
/// pantalla. Va como última capa del mapa.
class AtribucionOsm extends StatelessWidget {
  const AtribucionOsm({super.key});

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Align(
      alignment: Alignment.bottomRight,
      child: ColoredBox(
        color: tema.colorScheme.surface.withValues(alpha: 0.85),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: Espacio.xs,
            vertical: 2,
          ),
          child: Text('© OpenStreetMap', style: tema.textTheme.labelSmall),
        ),
      ),
    );
  }
}

/// Contornos de referencia, como la zona piloto: borde gris y un relleno
/// apenas visible, para que no se confundan con un recorrido. El gris es el
/// trazo de los marcadores, semitransparente: no sigue al tema porque el mapa
/// es claro en los dos.
class CapaZonas extends StatelessWidget {
  const CapaZonas(this.contornos, {super.key});

  final List<List<LatLng>> contornos;

  @override
  Widget build(BuildContext context) {
    final trazo = Theme.of(context).extension<ColoresFijos>()!.marcadorTrazo;
    return PolygonLayer(
      polygons: [
        for (final contorno in contornos)
          Polygon(
            points: contorno,
            color: trazo.withValues(alpha: 0.06),
            borderColor: trazo.withValues(alpha: 0.6),
            borderStrokeWidth: 2,
          ),
      ],
    );
  }
}

/// Un pin sobre el mapa (el punto de un reporte, el origen o el destino de un
/// recorrido). El mapa es claro en los dos temas: va oscuro, con un contorno
/// blanco que lo despega de las calles.
class PinMapa extends StatelessWidget {
  const PinMapa(this.icono, {super.key, this.tamanio = Espacio.xxl});

  final IconData icono;
  final double tamanio;

  @override
  Widget build(BuildContext context) {
    final fijos = Theme.of(context).extension<ColoresFijos>()!;
    return Icon(
      icono,
      size: tamanio,
      color: fijos.marcadorTrazo,
      shadows: [Shadow(color: fijos.marcadorBorde, blurRadius: 3)],
    );
  }
}
