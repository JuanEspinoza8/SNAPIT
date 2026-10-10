import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/mapa/agrupar.dart';
import 'package:snapit/funcionalidades/mapa/modelos.dart';

PuntoMapa punto(int id, double lat, double lon) => PuntoMapa(
  id: id,
  lat: lat,
  lon: lon,
  categoriaId: 1,
  categoriaNombre: 'Bache',
  estado: EstadoVisible.verificado,
  enRevision: false,
  primerReporteEn: DateTime.utc(2026, 10, 6),
  cantidadReportes: 1,
);

void main() {
  // Un rectángulo que cubre Neuquén capital con margen.
  const neuquen = Rectangulo(
    oeste: -68.2,
    sur: -39.0,
    este: -67.9,
    norte: -38.9,
  );

  // Dos incidentes a unos 200 m, sobre la misma calle.
  final cercanos = [punto(1, -38.9516, -68.0591), punto(2, -38.9516, -68.0568)];

  test('al alejar el zoom, los puntos cercanos se juntan en un grupo', () {
    final elementos = crearAgrupador(cercanos)(neuquen, 12);

    expect(elementos, hasLength(1));
    final grupo = elementos.single as Grupo;
    expect(grupo.cantidad, 2);
    expect(grupo.posicion.latitude, closeTo(-38.9516, 0.0001));
  });

  test('al acercar el zoom, el grupo se separa en sus puntos', () {
    final agrupar = crearAgrupador(cercanos);
    final grupo = agrupar(neuquen, 12).single as Grupo;

    final separados = agrupar(neuquen, grupo.zoomParaAbrir.toDouble());

    expect(separados, everyElement(isA<PuntoSuelto>()));
    expect(separados.map((e) => (e as PuntoSuelto).punto.id), {1, 2});
    // Un nivel antes seguían juntos: el zoom para abrir es el justo.
    expect(agrupar(neuquen, grupo.zoomParaAbrir - 1.0).single, isA<Grupo>());
  });

  test('el zoom con decimales se redondea, como en la web', () {
    final agrupar = crearAgrupador(cercanos);
    final grupo = agrupar(neuquen, 12).single as Grupo;

    expect(agrupar(neuquen, grupo.zoomParaAbrir - 0.4), hasLength(2));
    expect(agrupar(neuquen, grupo.zoomParaAbrir - 0.6), hasLength(1));
  });

  test('los que ni al zoom máximo se separan se ofrecen como lista', () {
    final mismoLugar = [
      punto(1, -38.9516, -68.0591),
      punto(2, -38.9516, -68.0591),
      punto(3, -38.95161, -68.05911),
    ];

    final elemento = crearAgrupador(mismoLugar)(
      neuquen,
      zoomMaximo.toDouble(),
    ).single;

    final superpuestos = elemento as Superpuestos;
    expect(superpuestos.puntos.map((p) => p.id), unorderedEquals([1, 2, 3]));
  });

  test('un punto aislado se dibuja suelto aun con el mapa alejado', () {
    final lejanos = [punto(1, -38.9516, -68.0591), punto(2, -38.80, -68.20)];

    final elementos = crearAgrupador(lejanos)(neuquen, 12);

    expect(elementos.whereType<PuntoSuelto>().map((e) => e.punto.id), [1]);
  });

  test('solo devuelve lo que cae dentro de la vista', () {
    const centro = Rectangulo(
      oeste: -68.07,
      sur: -38.96,
      este: -68.05,
      norte: -38.94,
    );
    final puntos = [punto(1, -38.9516, -68.0591), punto(2, -38.90, -68.20)];

    final elementos = crearAgrupador(puntos)(centro, 16);

    expect(elementos.map((e) => (e as PuntoSuelto).punto.id), [1]);
  });

  test('sin puntos no dibuja nada', () {
    expect(crearAgrupador([])(neuquen, 14), isEmpty);
  });
}
