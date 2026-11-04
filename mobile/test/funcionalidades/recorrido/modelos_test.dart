import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/funcionalidades/recorrido/modelos.dart';

import '../../apoyo/recorrido.dart';

void main() {
  test('la zona piloto pasa de [lon, lat] (GeoJSON) a LatLng', () {
    final [zona] = ZonaPiloto.desdeGeoJson(zonaPilotoJson);

    expect(zona.nombre, 'Bouquet Roldán y La Sirena');
    expect(zona.contorno.first, const LatLng(-38.96258, -68.09023));
    expect(zona.contorno, hasLength(5));
  });

  test('sin zonas activas, la lista queda vacía', () {
    expect(
      ZonaPiloto.desdeGeoJson({'type': 'FeatureCollection', 'features': []}),
      isEmpty,
    );
  });

  test('el recorrido trae la traza en orden, como LatLng', () {
    final recorrido = Recorrido.desdeJson(recorridoJson(metros: 650));

    expect(recorrido.distanciaMetros, 650);
    expect(recorrido.minutosEstimados, 13);
    expect(recorrido.traza.first, origenEnZona);
    expect(recorrido.traza.last, destinoEnZona);
  });

  test('la distancia se muestra en metros o en kilómetros con coma', () {
    Recorrido de(int metros) => Recorrido(
      distanciaMetros: metros,
      minutosEstimados: 1,
      traza: const [],
    );

    expect(de(450).distancia, '450 m');
    expect(de(999).distancia, '999 m');
    expect(de(1000).distancia, '1,0 km');
    expect(de(1260).distancia, '1,3 km');
  });

  test('el tiempo se muestra en minutos o en horas y minutos', () {
    Recorrido de(int minutos) => Recorrido(
      distanciaMetros: 1,
      minutosEstimados: minutos,
      traza: const [],
    );

    expect(de(9).tiempo, '9 min');
    expect(de(60).tiempo, '1 h');
    expect(de(65).tiempo, '1 h 5 min');
  });
}
