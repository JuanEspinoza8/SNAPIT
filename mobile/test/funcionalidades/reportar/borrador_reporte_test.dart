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
