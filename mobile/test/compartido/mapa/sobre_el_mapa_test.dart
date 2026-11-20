import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/compartido/mapa/capa_osm.dart';
import 'package:snapit/compartido/tema/tema_app.dart';
import 'package:snapit/funcionalidades/mapa/estados.dart';

import '../../apoyo/contraste.dart';

void main() {
  // En el oscuro el primario es casi blanco: si lo que va sobre el mapa lo
  // usara, no se vería sobre las calles.
  final oscuro = crearTema(PaletaSnapIt.oscuro);
  const fijos = ColoresFijos.valores;

  testWidgets('el pin es oscuro y con contorno blanco en el tema oscuro', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(theme: oscuro, home: const PinMapa(Icons.place)),
    );

    final pin = tester.widget<Icon>(find.byIcon(Icons.place));
    expect(pin.color, fijos.marcadorTrazo);
    expect(pin.shadows?.single.color, fijos.marcadorBorde);
  });

  testWidgets('el círculo de un grupo no sigue al tema', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: oscuro,
        home: const Center(child: MarcaGrupo(3)),
      ),
    );

    final circulo =
        tester.widget<Container>(find.byType(Container)).decoration!
            as BoxDecoration;
    expect(circulo.color, fijos.marcadorTrazo);
    expect(
      tester.widget<Text>(find.text('3')).style?.color,
      fijos.marcadorBorde,
    );
  });

  testWidgets('el borde gris de la zona piloto da 3:1 sobre el mapa', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: oscuro,
        home: FlutterMap(
          options: const MapOptions(
            initialCenter: LatLng(-38.95, -68.06),
            initialZoom: 14,
          ),
          children: const [
            CapaZonas([
              [
                LatLng(-38.94, -68.07),
                LatLng(-38.94, -68.05),
                LatLng(-38.96, -68.05),
              ],
            ]),
          ],
        ),
      ),
    );

    final borde = tester
        .widget<PolygonLayer>(find.byType(PolygonLayer))
        .polygons
        .single
        .borderColor;
    for (final fondo in [const Color(0xFFFFFFFF), const Color(0xFFF2EFE9)]) {
      expect(
        contraste(Color.alphaBlend(borde, fondo), fondo),
        greaterThanOrEqualTo(3),
      );
    }
  });
}
