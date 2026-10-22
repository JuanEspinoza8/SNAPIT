import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/funcionalidades/reportar/borrador_reporte.dart';

void main() {
  final completo = BorradorReporte(
    foto: const FotoReporte(ruta: '/tmp/pozo.jpg', tomadaConCamaraApp: true),
    categoriaId: 3,
    severidad: Severidad.grave,
    descripcion: '  Pozo frente a la escuela  ',
    punto: const LatLng(-38.95, -68.05),
    puntoMovido: true,
    // 14:30 en Argentina.
    registradoEn: DateTime.utc(2026, 10, 10, 17, 30),
  );

  group('faltantes', () {
    test('un borrador vacío pide foto, categoría, gravedad y ubicación', () {
      expect(const BorradorReporte().faltantes.keys, {
        CampoReporte.foto,
        CampoReporte.categoria,
        CampoReporte.severidad,
        CampoReporte.ubicacion,
      });
    });

    test('la descripción es opcional', () {
      expect(completo.copyWith(descripcion: '').faltantes, isEmpty);
    });
  });

  group('campos', () {
    test('arma los campos de POST /reportes con el punto del borrador', () {
      expect(completo.campos(), {
        'categoriaId': '3',
        'severidadDeclarada': 'GRAVE',
        'descripcion': 'Pozo frente a la escuela',
        'lat': '-38.95',
        'lon': '-68.05',
        'origen': 'APP_MOVIL',
        'registradoEn': '2026-10-10T17:30:00.000Z',
        'tomadaConCamaraApp': 'true',
      });
    });

    test('una foto de la galería va con tomadaConCamaraApp en false', () {
      final deGaleria = completo.copyWith(
        foto: const FotoReporte(ruta: '/tmp/b.jpg', tomadaConCamaraApp: false),
      );

      expect(deGaleria.campos()['tomadaConCamaraApp'], 'false');
    });

    test('la fecha se manda en UTC aunque se haya tomado en hora local', () {
      final local = DateTime(2026, 10, 10, 14, 30);

      final campo = completo.copyWith(registradoEn: local).campos();

      expect(campo['registradoEn'], local.toUtc().toIso8601String());
      expect(campo['registradoEn'], endsWith('Z'));
    });

    test('sin descripción ni fecha, esos campos no van', () {
      final campos = BorradorReporte(
        foto: completo.foto,
        categoriaId: 3,
        severidad: Severidad.leve,
        descripcion: '   ',
        punto: completo.punto,
      ).campos();

      expect(campos.containsKey('descripcion'), isFalse);
      expect(campos.containsKey('registradoEn'), isFalse);
    });
  });

  group('sugerencia', () {
    const sugerencia = SugerenciaIa(
      categoriaId: 3,
      severidad: Severidad.grave,
      registroIaId: 41,
    );
    const otraFoto = FotoReporte(ruta: '/tmp/b.jpg', tomadaConCamaraApp: true);

    test('lee la respuesta de la API', () {
      final leida = SugerenciaIa.desdeJson({
        'categoriaId': 3,
        'severidad': 'MODERADA',
        'registroIaId': 41,
      });

      expect(leida.categoriaId, 3);
      expect(leida.severidad, Severidad.moderada);
      expect(leida.registroIaId, 41);
    });

    test(
      'una gravedad desconocida es un error, no una gravedad cualquiera',
      () {
        expect(
          () => SugerenciaIa.desdeJson({
            'categoriaId': 3,
            'severidad': 'MUY_GRAVE',
            'registroIaId': 41,
          }),
          throwsFormatException,
        );
      },
    );

    test('completa los campos vacíos y los marca', () {
      final conFoto = const BorradorReporte().conFotoNueva(otraFoto);

      final sugerido = conFoto.conSugerencia(
        sugerencia,
        categoriaDisponible: true,
      );

      expect(conFoto.estadoSugerencia, EstadoSugerencia.buscando);
      expect(sugerido.estadoSugerencia, EstadoSugerencia.lista);
      expect(sugerido.categoriaId, 3);
      expect(sugerido.severidad, Severidad.grave);
      expect(sugerido.categoriaEsSugerida, isTrue);
      expect(sugerido.severidadEsSugerida, isTrue);
    });

    test('no pisa lo que ya eligió el vecino', () {
      final elegido = const BorradorReporte(
        categoriaId: 1,
      ).conFotoNueva(otraFoto);

      final sugerido = elegido.conSugerencia(
        sugerencia,
        categoriaDisponible: true,
      );

      expect(sugerido.categoriaId, 1);
      expect(sugerido.categoriaEsSugerida, isFalse);
      expect(sugerido.severidad, Severidad.grave);
      expect(sugerido.severidadEsSugerida, isTrue);
    });

    test('una categoría que el vecino no tiene en la lista no se completa', () {
      final sugerido = const BorradorReporte()
          .conFotoNueva(otraFoto)
          .conSugerencia(sugerencia, categoriaDisponible: false);

      expect(sugerido.categoriaId, isNull);
      expect(sugerido.categoriaEsSugerida, isFalse);
      expect(sugerido.severidad, Severidad.grave);
      // Se guarda igual: el servidor registra que no se aceptó.
      expect(sugerido.sugerencia, same(sugerencia));
    });

    test(
      'otra foto descarta la sugerencia y lo que completó, no lo del vecino',
      () {
        final sugerido =
            BorradorReporte(
                  severidad: Severidad.leve,
                  descripcion: 'Pozo',
                  punto: completo.punto,
                  registradoEn: completo.registradoEn,
                )
                .conFotoNueva(otraFoto)
                .conSugerencia(sugerencia, categoriaDisponible: true);
        // La categoría la completó la sugerencia; la gravedad la eligió el vecino.
        expect(sugerido.categoriaEsSugerida, isTrue);
        expect(sugerido.severidadEsSugerida, isFalse);

        final cambiada = sugerido.conFotoNueva(completo.foto!);

        expect(cambiada.sugerencia, isNull);
        expect(cambiada.estadoSugerencia, EstadoSugerencia.buscando);
        expect(cambiada.categoriaId, isNull);
        expect(cambiada.categoriaEsSugerida, isFalse);
        expect(cambiada.severidad, Severidad.leve);
        expect(cambiada.foto, same(completo.foto));
        expect(cambiada.descripcion, 'Pozo');
        expect(cambiada.punto, completo.punto);
        expect(cambiada.registradoEn, completo.registradoEn);
      },
    );

    test('se manda con los tres campos aunque no coincida con lo elegido', () {
      final sugerido = completo
          .conFotoNueva(completo.foto!)
          .conSugerencia(sugerencia, categoriaDisponible: true)
          .copyWith(severidad: Severidad.leve);

      expect(sugerido.campos(), {
        ...completo.campos(),
        'severidadDeclarada': 'LEVE',
        'categoriaSugeridaId': '3',
        'severidadSugerida': 'GRAVE',
        'registroIaId': '41',
      });
    });

    test('sin sugerencia no va ninguno de los tres', () {
      final sinSugerencia = completo
          .conFotoNueva(completo.foto!)
          .copyWith(estadoSugerencia: EstadoSugerencia.noDisponible);

      expect(sinSugerencia.campos(), completo.campos());
    });
  });

  test('copyWith conserva lo que no se cambia', () {
    final cambiado = completo.copyWith(categoriaId: 5);

    expect(cambiado.categoriaId, 5);
    expect(cambiado.punto, completo.punto);
    expect(cambiado.registradoEn, completo.registradoEn);
    expect(cambiado.foto, same(completo.foto));
  });

  test('cada campo de la API va al de la pantalla', () {
    expect(CampoReporte.desdeApi('foto'), CampoReporte.foto);
    expect(CampoReporte.desdeApi('categoriaId'), CampoReporte.categoria);
    expect(CampoReporte.desdeApi('severidadDeclarada'), CampoReporte.severidad);
    expect(CampoReporte.desdeApi('descripcion'), CampoReporte.descripcion);
    expect(CampoReporte.desdeApi('lat'), CampoReporte.ubicacion);
    expect(CampoReporte.desdeApi('lon'), CampoReporte.ubicacion);
    expect(CampoReporte.desdeApi('registradoEn'), isNull);
  });
}
