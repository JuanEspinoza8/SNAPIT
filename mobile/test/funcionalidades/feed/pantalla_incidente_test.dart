import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/funcionalidades/feed/pantalla_incidente.dart';
import 'package:snapit/funcionalidades/feed/visor_fotos.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

const cierre = {'id': 12, 'url': '/api/fotos/12'};

Map<String, Object?> fichaJson({Object? fotoCierre, String? resueltoEn}) => {
  'id': 3,
  'lat': -38.9516,
  'lon': -68.0591,
  'categoria': {'id': 1, 'nombre': 'Vereda rota'},
  'estado': fotoCierre == null ? 'EN_EJECUCION' : 'RESUELTO',
  'enRevision': false,
  'severidad': 'GRAVE',
  'primerReporteEn': '2026-10-06T15:15:33.494Z',
  'cantidadReportes': 2,
  'cantidadVecinos': 2,
  'direccion': 'Lanín 120, Villa Ceferino',
  'fotos': [
    {'id': 5, 'url': '/api/fotos/5'},
    {'id': 6, 'url': '/api/fotos/6'},
  ],
  'fotoCierre': fotoCierre,
  'resueltoEn': resueltoEn,
};

ServidorFalso servidorCon(Map<String, Object?> ficha, {String rol = 'VECINO'}) {
  var siguiendo = false;
  return ServidorFalso((RequestOptions pedido) {
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson(rol: rol)});
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/incidentes/feed':
        return json(200, {'incidentes': <Object>[], 'siguiente': null});
      case '/incidentes/3':
        return json(200, ficha);
      case '/incidentes/3/seguimiento':
        if (pedido.method == 'GET') {
          return json(200, {'siguiendo': siguiendo});
        }
        if (pedido.method == 'POST') siguiendo = true;
        if (pedido.method == 'DELETE') siguiendo = false;
        return json(204, '');
      case '/social/incidentes/3/reportes':
        return json(200, {'reportes': <Object>[]});
      case '/social/incidentes/3/comentarios':
        return json(200, {'comentarios': <Object>[]});
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  });
}

void main() {
  setUp(guardarSesion);

  // Un celular de 360 × 780.
  Future<void> abrirFicha(WidgetTester tester, ServidorFalso servidor) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final contenedor = await abrirApp(tester, servidor);
    contenedor.read(rutasProvider).push(Rutas.incidente(3));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaIncidente), findsOneWidget);
  }

  /// La foto con esa descripción. En los tests no carga, y el aviso «No se
  /// pudo cargar la foto» se suma a la etiqueta en otra línea.
  Finder foto(String descripcion) => find.bySemanticsLabel(
    RegExp('^${RegExp.escape(descripcion)}\$', multiLine: true),
  );

  /// Separa dos dedos sobre la foto, como para acercarla.
  Future<void> acercar(WidgetTester tester) async {
    final centro = tester.getCenter(find.byType(InteractiveViewer));
    final dedo1 = await tester.startGesture(centro - const Offset(20, 20));
    final dedo2 = await tester.startGesture(
      centro + const Offset(20, 20),
      pointer: 2,
    );
    for (var i = 0; i < 10; i++) {
      await dedo1.moveBy(const Offset(-10, -10));
      await dedo2.moveBy(const Offset(10, 10));
      await tester.pump();
    }
    await dedo1.up();
    await dedo2.up();
    await tester.pumpAndSettle();
  }

  double escala(WidgetTester tester) => tester
      .widget<InteractiveViewer>(find.byType(InteractiveViewer))
      .transformationController!
      .value
      .getMaxScaleOnAxis();

  testWidgets('sin cierre muestra solo las fotos de los reportes', (
    tester,
  ) async {
    await abrirFicha(tester, servidorCon(fichaJson()));

    expect(foto('Foto 1 de 2 de Vereda rota'), findsOneWidget);
    expect(find.text('Antes'), findsNothing);
    expect(find.textContaining('Después'), findsNothing);
    expect(find.text('Resuelto'), findsNothing);
  });

  testWidgets('resuelto muestra el antes y el después con la fecha', (
    tester,
  ) async {
    await abrirFicha(
      tester,
      servidorCon(
        fichaJson(fotoCierre: cierre, resueltoEn: '2026-11-08T18:20:00.000Z'),
      ),
    );

    expect(find.text('Antes'), findsOneWidget);
    expect(foto('Foto 1 de 2 de Vereda rota, antes'), findsOneWidget);
    expect(
      find.text('Después · resuelto el 8 de noviembre de 2026'),
      findsOneWidget,
    );
    expect(
      tester.getSemantics(
        foto('Vereda rota, después: cómo quedó al resolverse'),
      ),
      isSemantics(isImage: true, isButton: true, hasTapAction: true),
    );

    // En los datos, debajo de «Vecinos que lo reportaron».
    await tester.dragUntilVisible(
      find.text('8 de noviembre de 2026'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    expect(
      find.ancestor(
        of: find.text('8 de noviembre de 2026'),
        matching: find.byWidgetPredicate(
          (w) =>
              w is Column &&
              w.children.any((c) => c is Text && c.data == 'Resuelto'),
        ),
      ),
      findsOneWidget,
    );
  });

  testWidgets('tocar una foto del antes la amplía y se pasa a la otra', (
    tester,
  ) async {
    await abrirFicha(tester, servidorCon(fichaJson(fotoCierre: cierre)));

    await tester.tap(foto('Foto 1 de 2 de Vereda rota, antes'));
    await tester.pumpAndSettle();

    expect(find.byType(VisorFotos), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'Antes'), findsOneWidget);
    expect(find.text('1 de 2'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.text('2 de 2'), findsOneWidget);

    await tester.tap(find.byType(CloseButton));
    await tester.pumpAndSettle();
    expect(find.byType(VisorFotos), findsNothing);
    expect(find.byType(PantallaIncidente), findsOneWidget);
  });

  testWidgets('la foto del después se amplía sola', (tester) async {
    await abrirFicha(tester, servidorCon(fichaJson(fotoCierre: cierre)));

    await tester.tap(foto('Vereda rota, después: cómo quedó al resolverse'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Después'), findsOneWidget);
    // Una sola foto: sin «1 de 1».
    expect(find.textContaining(RegExp(r'^\d+ de \d+$')), findsNothing);
  });

  testWidgets('sin cierre, las fotos también se amplían', (tester) async {
    await abrirFicha(tester, servidorCon(fichaJson()));

    await tester.tap(foto('Foto 1 de 2 de Vereda rota'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Vereda rota'), findsOneWidget);
    expect(find.byType(VisorFotos), findsOneWidget);
    expect(find.text('1 de 2'), findsOneWidget);
  });

  testWidgets('con la foto acercada, deslizar la mueve y no pasa a la otra', (
    tester,
  ) async {
    await abrirFicha(tester, servidorCon(fichaJson()));
    await tester.tap(foto('Foto 1 de 2 de Vereda rota'));
    await tester.pumpAndSettle();

    await acercar(tester);
    expect(escala(tester), greaterThan(1));

    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.text('1 de 2'), findsOneWidget);
  });

  group('si no se puede ver la ficha', () {
    ServidorFalso servidorConError(int status, String codigo, String mensaje) =>
        ServidorFalso(
          (RequestOptions pedido) => switch (pedido.path) {
            '/auth/yo' => json(200, {'usuario': usuarioJson()}),
            '/incidentes/feed' => json(200, {
              'incidentes': <Object>[],
              'siguiente': null,
            }),
            '/incidentes/3' => errorApi(status, codigo, mensaje),
            _ => errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe'),
          },
        );

    testWidgets('un incidente que ya no está lo dice, sin reintentar', (
      tester,
    ) async {
      // Por ejemplo, al tocar el aviso de un incidente que se desestimó.
      await abrirFicha(
        tester,
        servidorConError(
          404,
          'INCIDENTE_NO_ENCONTRADO',
          'El incidente no existe',
        ),
      );

      expect(
        find.text('Este incidente ya no está en el mapa.'),
        findsOneWidget,
      );
      expect(find.text('Reintentar'), findsNothing);
    });

    testWidgets('otro error muestra el mensaje y deja reintentar', (
      tester,
    ) async {
      final servidor = servidorConError(
        500,
        'ERROR_INTERNO',
        'Ocurrió un error en el servidor',
      );
      await abrirFicha(tester, servidor);

      expect(find.text('Ocurrió un error en el servidor'), findsOneWidget);
      await tester.tap(find.text('Reintentar'));
      await tester.pumpAndSettle();
      expect(servidor.cantidad('/incidentes/3'), 2);
    });
  });

  testWidgets('el vecino sigue y deja de seguir el incidente', (tester) async {
    final servidor = servidorCon(fichaJson());
    await abrirFicha(tester, servidor);

    expect(find.text('Seguir'), findsOneWidget);

    await tester.tap(find.text('Seguir'));
    await tester.pumpAndSettle();

    expect(find.text('Dejar de seguir'), findsOneWidget);
    expect(
      servidor.pedidos.any(
        (p) => p.metodo == 'POST' && p.ruta == '/incidentes/3/seguimiento',
      ),
      isTrue,
    );

    await tester.tap(find.text('Dejar de seguir'));
    await tester.pumpAndSettle();

    expect(find.text('Seguir'), findsOneWidget);
    expect(
      servidor.pedidos.any(
        (p) => p.metodo == 'DELETE' && p.ruta == '/incidentes/3/seguimiento',
      ),
      isTrue,
    );
  });

  testWidgets('el operador no ve el botón de seguir', (tester) async {
    final servidor = servidorCon(fichaJson(), rol: 'OPERADOR');
    await abrirFicha(tester, servidor);

    expect(find.text('Seguir'), findsNothing);
    expect(find.text('Dejar de seguir'), findsNothing);
    expect(
      servidor.pedidos.where((p) => p.ruta == '/incidentes/3/seguimiento'),
      isEmpty,
    );
  });
}
