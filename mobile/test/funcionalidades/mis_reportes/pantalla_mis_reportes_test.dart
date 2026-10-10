import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/mis_reportes/repositorio_mis_reportes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/reportes_mios.dart';
import '../../apoyo/servidor_falso.dart';

const fichaJson = {
  'id': 9,
  'lat': -38.9516,
  'lon': -68.0591,
  'categoria': {'id': 3, 'nombre': 'Cordón sin rampa'},
  'estado': 'REGISTRADO',
  'enRevision': true,
  'primerReporteEn': '2026-10-06T15:15:33.494Z',
  'cantidadReportes': 1,
  'cantidadVecinos': 1,
  'direccion': null,
  'fotos': [
    {'id': 1, 'url': '/api/fotos/1'},
  ],
};

/// El servidor de una sesión de vecino. [mios] es lo que contesta
/// `GET /reportes/mios`; por defecto, la lista [reportes].
class ServidorMisReportes {
  ServidorMisReportes([List<Map<String, Object?>>? reportes])
    : reportes = reportes ?? [] {
    servidor = ServidorFalso(_responder);
  }

  late final ServidorFalso servidor;
  List<Map<String, Object?>> reportes;
  Future<ResponseBody> Function(RequestOptions pedido)? mios;

  int get pedidosLista => servidor.cantidad('/reportes/mios');

  Future<ResponseBody> _responder(RequestOptions pedido) {
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson()});
      case '/auth/salir':
        return json(204, '');
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/incidentes/9':
        return json(200, fichaJson);
      case '/reportes/mios':
        return mios?.call(pedido) ?? json(200, {'reportes': reportes});
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }
}

void main() {
  setUp(guardarSesion);

  Future<void> abrirMisReportes(
    WidgetTester tester,
    ServidorMisReportes servidor,
  ) async {
    await abrirApp(tester, servidor.servidor);
    await tester.tap(find.text('Mis reportes'));
    await tester.pumpAndSettle();
  }

  /// La fila de la lista que contiene [texto].
  Finder fila(String texto) =>
      find.ancestor(of: find.text(texto), matching: find.byType(InkWell));

  testWidgets('no pide la lista hasta que se abre la pestaña', (tester) async {
    final servidor = ServidorMisReportes();
    await abrirApp(tester, servidor.servidor);
    expect(servidor.pedidosLista, 0);

    await tester.tap(find.text('Mis reportes'));
    await tester.pumpAndSettle();

    expect(servidor.pedidosLista, 1);
  });

  testWidgets('sin reportes muestra un mensaje y lleva a reportar', (
    tester,
  ) async {
    await abrirMisReportes(tester, ServidorMisReportes());

    expect(find.text('Todavía no hiciste reportes'), findsOneWidget);
    expect(find.byType(ListView), findsNothing);

    await tester.tap(find.text('Reportar un problema'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Reportar un problema'), findsOneWidget);
  });

  testWidgets(
    'cada reporte tiene categoría, fecha y estado con texto e ícono',
    (tester) async {
      final servidor = ServidorMisReportes([
        reporteJson(id: 17),
        reporteJson(
          id: 16,
          estadoVerificacion: 'VERIFICADO',
          incidente: const {'id': 8, 'estado': 'RESUELTO', 'enRevision': false},
        ),
        reporteJson(
          id: 15,
          estadoVerificacion: 'DESESTIMADO',
          incidente: const {
            'id': 7,
            'estado': 'VERIFICADO',
            'enRevision': false,
          },
        ),
      ]);
      await abrirMisReportes(tester, servidor);

      expect(find.text('Cordón sin rampa'), findsNWidgets(3));
      expect(find.text('6 de octubre de 2026'), findsNWidgets(3));
      for (final (texto, icono) in [
        ('En revisión', Icons.hourglass_empty),
        ('Resuelto', Icons.done_all),
        ('Desestimado', Icons.block),
      ]) {
        final etiqueta = find.ancestor(
          of: find.text(texto),
          matching: find.byType(Row),
        );
        expect(
          find.descendant(of: etiqueta.first, matching: find.byIcon(icono)),
          findsOneWidget,
          reason: texto,
        );
      }
      // El orden es el del servidor: del más nuevo al más viejo.
      final textos = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data)
          .where((t) => ['En revisión', 'Resuelto', 'Desestimado'].contains(t));
      expect(textos, ['En revisión', 'Resuelto', 'Desestimado']);
    },
  );

  testWidgets('tocar un reporte abre la ficha de su incidente', (tester) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    await abrirMisReportes(tester, servidor);

    await tester.tap(fila('Cordón sin rampa'));
    await tester.pumpAndSettle();

    expect(servidor.servidor.cantidad('/incidentes/9'), 1);
    expect(find.text('Vecinos que lo reportaron'), findsOneWidget);
  });

  testWidgets('con el incidente desestimado no abre nada: no tiene ficha', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([
      reporteJson(
        estadoVerificacion: 'DESESTIMADO',
        incidente: const {
          'id': 9,
          'estado': 'DESESTIMADO',
          'enRevision': false,
        },
      ),
    ]);
    await abrirMisReportes(tester, servidor);

    await tester.tap(find.text('Cordón sin rampa'));
    await tester.pumpAndSettle();

    expect(servidor.servidor.cantidad('/incidentes/9'), 0);
    expect(find.byIcon(Icons.chevron_right), findsNothing);
  });

  testWidgets('una foto que no se puede bajar deja un recuadro', (
    tester,
  ) async {
    // En los tests toda imagen de la red falla, igual que un 404.
    final servidor = ServidorMisReportes([
      reporteJson(),
      reporteJson(id: 16, fotos: const []),
    ]);
    await abrirMisReportes(tester, servidor);

    expect(find.byIcon(Icons.hide_image_outlined), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('sin conexión lo dice y Reintentar vuelve a pedir', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    servidor.mios = sinConexion;
    await abrirMisReportes(tester, servidor);

    expect(find.textContaining('conexión'), findsOneWidget);
    expect(find.text('Cordón sin rampa'), findsNothing);

    servidor.mios = null;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(servidor.pedidosLista, 2);
    expect(find.text('Cordón sin rampa'), findsOneWidget);
  });

  testWidgets('deslizar hacia abajo trae los cambios de estado', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    await abrirMisReportes(tester, servidor);
    expect(find.text('En revisión'), findsOneWidget);

    servidor.reportes = [
      reporteJson(
        estadoVerificacion: 'VERIFICADO',
        incidente: const {'id': 9, 'estado': 'DERIVADO', 'enRevision': false},
      ),
    ];
    await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();

    expect(servidor.pedidosLista, 2);
    expect(find.text('Derivado al área'), findsOneWidget);
  });

  testWidgets('la lista vacía también se recarga deslizando', (tester) async {
    final servidor = ServidorMisReportes();
    await abrirMisReportes(tester, servidor);

    servidor.reportes = [reporteJson()];
    await tester.fling(
      find.text('Todavía no hiciste reportes'),
      const Offset(0, 300),
      1000,
    );
    await tester.pumpAndSettle();

    expect(find.text('Cordón sin rampa'), findsOneWidget);
  });

  testWidgets('si la recarga falla, la lista sigue y avisa', (tester) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    await abrirMisReportes(tester, servidor);

    servidor.mios = sinConexion;
    await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Cordón sin rampa'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(SnackBar),
        matching: find.textContaining('conexión'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('al salir de la cuenta, la lista se descarta', (tester) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    final contenedor = await abrirApp(tester, servidor.servidor);
    await tester.tap(find.text('Mis reportes'));
    await tester.pumpAndSettle();
    expect(contenedor.exists(misReportesProvider), isTrue);

    await tester.tap(find.byTooltip('Cuenta'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salir'));
    await tester.pumpAndSettle();

    expect(contenedor.exists(misReportesProvider), isFalse);
  });
}
