import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/mis_reportes/modelos.dart';

import '../../apoyo/reportes_mios.dart';

void main() {
  group('ReporteMio.desdeJson', () {
    test('toma los datos de la fila y el incidente', () {
      final reporte = ReporteMio.desdeJson(reporteJson());

      expect(reporte.id, 15);
      expect(reporte.registradoEn, DateTime.utc(2026, 10, 6, 15, 15, 33, 494));
      expect(reporte.categoriaNombre, 'Cordón sin rampa');
      expect(reporte.fotoIds, [1]);
      expect(reporte.estadoVerificacion, EstadoVerificacion.pendienteRevision);
      expect(reporte.incidenteId, 9);
      expect(reporte.estadoIncidente, EstadoIncidente.registrado);
    });

    test('acepta un reporte sin incidente y sin fotos', () {
      final reporte = ReporteMio.desdeJson(
        reporteJson(incidente: null, fotos: const []),
      );

      expect(reporte.incidenteId, isNull);
      expect(reporte.estadoIncidente, isNull);
      expect(reporte.fotoIds, isEmpty);
    });

    test('un estado desconocido es un error, no un estado inventado', () {
      expect(
        () => ReporteMio.desdeJson(reporteJson(estadoVerificacion: 'OTRO')),
        throwsFormatException,
      );
      expect(
        () => ReporteMio.desdeJson(
          reporteJson(incidente: const {'id': 9, 'estado': 'CERRADO'}),
        ),
        throwsFormatException,
      );
    });
  });

  group('estadoParaElVecino', () {
    test('con incidente, muestra el del incidente', () {
      for (final estado in EstadoIncidente.values) {
        expect(
          estadoParaElVecino(EstadoVerificacion.verificado, estado),
          estado,
          reason: estado.name,
        );
      }
    });

    test(
      'un reporte desestimado se ve desestimado aunque el problema siga',
      () {
        expect(
          estadoParaElVecino(
            EstadoVerificacion.desestimado,
            EstadoIncidente.verificado,
          ),
          EstadoIncidente.desestimado,
        );
        expect(
          estadoParaElVecino(EstadoVerificacion.desestimado, null),
          EstadoIncidente.desestimado,
        );
      },
    );

    test('un reporte pendiente en un incidente que verificaron otros se ve '
        'verificado', () {
      expect(
        estadoParaElVecino(
          EstadoVerificacion.pendienteRevision,
          EstadoIncidente.verificado,
        ),
        EstadoIncidente.verificado,
      );
    });

    test('un incidente desestimado se ve desestimado aunque el reporte no', () {
      expect(
        estadoParaElVecino(
          EstadoVerificacion.pendienteRevision,
          EstadoIncidente.desestimado,
        ),
        EstadoIncidente.desestimado,
      );
    });

    test('sin incidente, sale de la verificación', () {
      expect(
        estadoParaElVecino(EstadoVerificacion.pendienteRevision, null),
        EstadoIncidente.registrado,
      );
      expect(
        estadoParaElVecino(EstadoVerificacion.verificado, null),
        EstadoIncidente.verificado,
      );
    });
  });

  group('tieneFicha', () {
    test('sí con un incidente que no está desestimado', () {
      expect(ReporteMio.desdeJson(reporteJson()).tieneFicha, isTrue);
    });

    test('no sin incidente', () {
      expect(
        ReporteMio.desdeJson(reporteJson(incidente: null)).tieneFicha,
        isFalse,
      );
    });

    test('no con el incidente desestimado: el servidor no tiene su ficha', () {
      final reporte = ReporteMio.desdeJson(
        reporteJson(incidente: const {'id': 9, 'estado': 'DESESTIMADO'}),
      );
      expect(reporte.tieneFicha, isFalse);
    });

    test('sí si solo se desestimó el reporte y el problema sigue', () {
      final reporte = ReporteMio.desdeJson(
        reporteJson(
          estadoVerificacion: 'DESESTIMADO',
          incidente: const {'id': 9, 'estado': 'VERIFICADO'},
        ),
      );
      expect(reporte.estado, EstadoIncidente.desestimado);
      expect(reporte.tieneFicha, isTrue);
    });
  });
}
