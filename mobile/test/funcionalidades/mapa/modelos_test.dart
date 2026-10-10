import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/formato/fechas.dart';
import 'package:snapit/funcionalidades/mapa/modelos.dart';
import 'package:snapit/funcionalidades/mapa/repositorio_mapa.dart';

void main() {
  const vista = Rectangulo(
    oeste: -68.1,
    sur: -38.97,
    este: -68.03,
    norte: -38.93,
  );

  group('parametrosIncidentes', () {
    test('sin filtros manda solo el rectángulo, oeste,sur,este,norte', () {
      expect(
        parametrosIncidentes((filtros: const FiltrosMapa(), vista: vista)),
        {'bbox': '-68.1000,-38.9700,-68.0300,-38.9300'},
      );
    });

    test('suma cada filtro con el nombre y el formato de la API', () {
      final filtros = FiltrosMapa(
        categoriaId: 3,
        estado: EstadoVisible.enEjecucion,
        desde: DateTime(2026, 10, 1),
        hasta: DateTime(2026, 10, 9),
      );

      expect(parametrosIncidentes((filtros: filtros, vista: vista)), {
        'bbox': '-68.1000,-38.9700,-68.0300,-38.9300',
        'categoriaId': '3',
        'estado': 'EN_EJECUCION',
        'desde': '2026-10-01',
        'hasta': '2026-10-09',
      });
    });
  });

  group('Rectangulo.paraConsulta', () {
    test(
      'redondea a 4 decimales: un movimiento mínimo no cambia la consulta',
      () {
        final a = Rectangulo.paraConsulta(
          oeste: -68.10002,
          sur: -38.97002,
          este: -68.03002,
          norte: -38.93002,
        );
        final b = Rectangulo.paraConsulta(
          oeste: -68.10008,
          sur: -38.97008,
          este: -68.03008,
          norte: -38.93008,
        );

        expect(a, b);
        expect(
          [a.oeste, a.sur, a.este, a.norte],
          [-68.1001, -38.9701, -68.03, -38.93],
        );
      },
    );

    test('redondea hacia afuera: lo que se ve en el borde siempre se pide', () {
      // Con el redondeo al más cercano, cada uno de estos bordes quedaba unos
      // metros hacia adentro y un incidente justo ahí se contaba sin dibujarse
      // (pasó en el emulador) o no se pedía.
      final r = Rectangulo.paraConsulta(
        oeste: -68.07384,
        sur: -38.96364,
        este: -68.06496,
        norte: -38.95246,
      );

      expect(r.oeste, lessThanOrEqualTo(-68.07384));
      expect(r.sur, lessThanOrEqualTo(-38.96364));
      expect(r.este, greaterThanOrEqualTo(-68.06496));
      expect(r.norte, greaterThanOrEqualTo(-38.95246));
    });

    test('recorta a los límites que acepta el servidor', () {
      final r = Rectangulo.paraConsulta(
        oeste: -250,
        sur: -95,
        este: 200,
        norte: 91,
      );

      expect([r.oeste, r.sur, r.este, r.norte], [-180, -90, 180, 90]);
    });
  });

  group('lectura de la API', () {
    Map<String, dynamic> puntoJson({String estado = 'REGISTRADO'}) => {
      'id': 9,
      'lat': -38,
      'lon': -68.0591,
      'categoriaId': 3,
      'categoriaNombre': 'Cordón sin rampa',
      'estado': estado,
      'enRevision': true,
      'primerReporteEn': '2026-10-06T15:15:33.494Z',
      'cantidadReportes': 1,
    };

    test('lee un punto, aunque la coordenada venga sin decimales', () {
      final punto = PuntoMapa.desdeJson(puntoJson());

      expect(punto.lat, -38.0);
      expect(punto.estado, EstadoVisible.registrado);
      expect(punto.enRevision, isTrue);
      expect(punto.primerReporteEn, DateTime.utc(2026, 10, 6, 15, 15, 33, 494));
    });

    test(
      'un estado que el mapa no conoce es un error, no un punto mal pintado',
      () {
        expect(
          () => PuntoMapa.desdeJson(puntoJson(estado: 'DESESTIMADO')),
          throwsFormatException,
        );
      },
    );

    test('lee la ficha con sus fotos y sin dirección', () {
      final ficha = FichaIncidente.desdeJson({
        'id': 9,
        'lat': -38.9516,
        'lon': -68.0591,
        'categoria': {'id': 3, 'nombre': 'Cordón sin rampa'},
        'estado': 'VERIFICADO',
        'enRevision': false,
        'primerReporteEn': '2026-10-06T15:15:33.494Z',
        'cantidadReportes': 2,
        'cantidadVecinos': 2,
        'direccion': null,
        'fotos': [
          {'id': 1, 'url': '/api/fotos/1'},
          {'id': 4, 'url': '/api/fotos/4'},
        ],
      });

      expect(ficha.categoriaNombre, 'Cordón sin rampa');
      expect(ficha.estado, EstadoVisible.verificado);
      expect(ficha.direccion, isNull);
      expect(ficha.fotoIds, [1, 4]);
    });
  });

  test('cuenta los filtros activos', () {
    expect(const FiltrosMapa().cantidadActivos, 0);
    expect(
      FiltrosMapa(categoriaId: 1, desde: DateTime(2026)).cantidadActivos,
      2,
    );
  });

  group('fechas', () {
    test('la fecha del primer reporte se muestra en hora de Argentina', () {
      // 01:30 UTC del 7 es todavía el 6 en Argentina (UTC−3).
      expect(
        fechaLarga(DateTime.utc(2026, 10, 7, 1, 30)),
        '6 de octubre de 2026',
      );
      expect(fechaLarga(DateTime.utc(2026, 10, 7, 3)), '7 de octubre de 2026');
    });

    test('los días del filtro van como AAAA-MM-DD', () {
      expect(fechaApi(DateTime(2026, 1, 5)), '2026-01-05');
      expect(fechaCorta(DateTime(2026, 1, 5)), '5/1/2026');
    });
  });
}
