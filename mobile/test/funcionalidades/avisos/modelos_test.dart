import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/avisos/modelos.dart';

Map<String, Object?> avisoJson({
  int id = 31,
  String tipo = 'CAMBIO_ESTADO',
  int? incidenteId = 9,
  String? leidaEn,
}) => {
  'id': id,
  'tipo': tipo,
  'incidenteId': incidenteId,
  'titulo': 'Tu reporte avanzó',
  'cuerpo': 'El pozo de Lago Huechulafquen pasó a En ejecución',
  'creadoEn': '2026-11-04T13:10:00.000Z',
  'enviadaEn': '2026-11-04T13:10:01.000Z',
  'leidaEn': leidaEn,
};

void main() {
  group('Aviso', () {
    test('se lee completo y arranca sin leer', () {
      final aviso = Aviso.desdeJson(avisoJson());

      expect(aviso.id, 31);
      expect(aviso.tipo, TipoAviso.cambioEstado);
      expect(aviso.incidenteId, 9);
      expect(aviso.titulo, 'Tu reporte avanzó');
      expect(aviso.creadoEn, DateTime.utc(2026, 11, 4, 13, 10));
      expect(aviso.enviadaEn, DateTime.utc(2026, 11, 4, 13, 10, 1));
      expect(aviso.leida, isFalse);
    });

    test('un aviso de otro tipo que todavía no conoce no rompe la lista', () {
      expect(
        Aviso.desdeJson(avisoJson(tipo: 'TIPO_NUEVO')).tipo,
        TipoAviso.otro,
      );
    });

    test('sin incidente ni envío, los campos quedan nulos', () {
      final aviso = Aviso.desdeJson({
        ...avisoJson(incidenteId: null),
        'enviadaEn': null,
      });

      expect(aviso.incidenteId, isNull);
      expect(aviso.enviadaEn, isNull);
    });

    test('marcar leído conserva la primera hora de lectura', () {
      final primera = DateTime.utc(2026, 11, 4, 14);
      final aviso = Aviso.desdeJson(
        avisoJson(leidaEn: primera.toIso8601String()),
      );

      expect(aviso.leida, isTrue);
      expect(aviso.marcarLeida(DateTime.utc(2026, 11, 5)).leidaEn, primera);
    });
  });

  group('MensajePush', () {
    test('lee los datos que manda FCM, aunque vengan como texto', () {
      final mensaje = MensajePush.desdeDatos(
        {'notificacionId': '31', 'tipo': 'CIERRE', 'incidenteId': '9'},
        titulo: 'Se cerró',
        cuerpo: 'El incidente se cerró',
      );

      expect(mensaje.notificacionId, 31);
      expect(mensaje.tipo, 'CIERRE');
      expect(mensaje.incidenteId, 9);
      expect(mensaje.titulo, 'Se cerró');
      expect(mensaje.cuerpo, 'El incidente se cerró');
    });

    test('sin incidente, el id queda nulo', () {
      final mensaje = MensajePush.desdeDatos({'tipo': 'VERIFICACION'});

      expect(mensaje.incidenteId, isNull);
      expect(mensaje.notificacionId, isNull);
    });
  });
}
