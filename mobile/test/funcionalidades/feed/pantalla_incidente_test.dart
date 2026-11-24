import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';
import 'package:snapit/funcionalidades/feed/pantalla_incidente.dart';
import 'package:snapit/funcionalidades/feed/visor_fotos.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';
import '../../apoyo/social.dart';

const cierre = {'id': 12, 'url': '/api/fotos/12'};

Map<String, Object?> fichaJson({
  Object? fotoCierre,
  String? resueltoEn,
  int confirmaciones = 2,
}) => {
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
  'cantidadConfirmaciones': confirmaciones,
  'direccion': 'Lanín 120, Villa Ceferino',
  'fotos': [
    {'id': 5, 'url': '/api/fotos/5'},
    {'id': 6, 'url': '/api/fotos/6'},
  ],
  'fotoCierre': fotoCierre,
  'resueltoEn': resueltoEn,
};

/// Un reporte de la lista del problema (`GET /social/incidentes/3/reportes`).
Map<String, Object?> reporteDelProblemaJson(int id, int numero) => {
  'id': id,
  'incidenteId': 3,
  'descripcion': null,
  'creadoEn': '2026-10-06T15:15:33.494Z',
  'autor': {'numero': numero, 'nombre': 'Vecino $numero'},
  'fotos': [
    {'id': id * 10, 'url': '/api/fotos/${id * 10}'},
  ],
  'cantidadMeGusta': numero,
  'cantidadComentarios': 0,
};

/// Responde como el servidor con la ficha del incidente 3, sus reportes y
/// [comentarios], los del problema en general: se pueden escribir, editar y
/// eliminar, y la lista cambia como en el servidor real. Confirmar que sigue
/// suma uno al contador de la ficha, una sola vez; con [confirmado], el
/// vecino ya lo había hecho.
ServidorFalso servidorCon(
  Map<String, Object?> ficha, {
  String rol = 'VECINO',
  List<Map<String, Object?>>? comentarios,
  bool confirmado = false,
}) {
  var siguiendo = false;
  var confirmaciones = ficha['cantidadConfirmaciones'] as int;
  final delProblema = comentarios ?? [];
  return ServidorFalso((RequestOptions pedido) {
    switch ((pedido.method, pedido.path)) {
      case ('GET', '/social/incidentes/3/comentarios'):
        return json(200, {'incidenteId': 3, 'comentarios': delProblema});
      case ('POST', '/social/incidentes/3/comentarios'):
        final nuevo = comentarioJson(
          9,
          (pedido.data as Map)['texto'] as String,
          autor: autorJson(3),
          esMio: true,
        );
        delProblema.add(nuevo);
        return json(201, nuevo);
      case ('PATCH', final ruta) when ruta.startsWith('/social/comentarios/'):
        final id = int.parse(ruta.split('/').last);
        final i = delProblema.indexWhere((c) => c['id'] == id);
        delProblema[i] = {
          ...delProblema[i],
          'texto': (pedido.data as Map)['texto'],
          'editadoEn': '2026-10-09T15:15:33.494Z',
        };
        return json(200, delProblema[i]);
      case ('DELETE', final ruta) when ruta.startsWith('/social/comentarios/'):
        final id = int.parse(ruta.split('/').last);
        delProblema.removeWhere((c) => c['id'] == id);
        return json(204, '');
    }
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson(rol: rol)});
      case '/auth/ingreso':
        return ingresoCorrecto(rol: rol);
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/social/feed':
        return json(200, {'reportes': <Object>[], 'siguiente': null});
      case '/incidentes/3':
        return json(200, ficha);
      case '/incidentes/3/confirmacion':
        return json(200, {'confirmado': confirmado});
      case '/incidentes/3/confirmaciones':
        if (confirmado) {
          return errorApi(
            409,
            'YA_CONFIRMADO',
            'Ya confirmaste que este problema sigue',
          );
        }
        confirmado = true;
        confirmaciones++;
        return json(201, {
          'incidenteId': 3,
          'cantidadConfirmaciones': confirmaciones,
        });
      case '/incidentes/3/seguimiento':
        if (pedido.method == 'GET') {
          return json(200, {'siguiendo': siguiendo});
        }
        if (pedido.method == 'POST') siguiendo = true;
        if (pedido.method == 'DELETE') siguiendo = false;
        return json(204, '');
      case '/social/incidentes/3/reportes':
        return json(200, {
          'reportes': [
            reporteDelProblemaJson(31, 1),
            reporteDelProblemaJson(32, 2),
          ],
        });
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  });
}

void main() {
  setUp(guardarSesion);

  // Un celular de 360 × 780. Con [alto] más grande, la ficha entra entera
  // sin scrollear.
  Future<void> abrirFicha(
    WidgetTester tester,
    ServidorFalso servidor, {
    double alto = 780,
  }) async {
    tester.view.physicalSize = Size(1080, alto * 3);
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
    // En los datos no hay fecha de resolución.
    expect(find.byIcon(Icons.check_circle_outline), findsNothing);
  });

  testWidgets('dice en qué paso está su atención', (tester) async {
    await abrirFicha(tester, servidorCon(fichaJson()));

    await tester.dragUntilVisible(
      find.text('Estado del problema'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    expect(
      find.bySemanticsLabel('En revisión, cumplido, 6 de octubre de 2026'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel('En ejecución, cumplido, estado actual'),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Resuelto, pendiente'), findsOneWidget);
    expect(find.textContaining('Fotos de los vecinos'), findsNothing);
  });

  testWidgets('lo reportaron dos vecinos: lista sus reportes, y uno abre su '
      'publicación', (tester) async {
    await abrirFicha(tester, servidorCon(fichaJson()));

    await tester.dragUntilVisible(
      find.text('Vecino 2'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    expect(find.text('Reportes (2)'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp('2 me gusta, 0 comentarios')),
      findsOneWidget,
    );
  });

  testWidgets('con letra grande (2×) en un celular de 360 dp no se desborda', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await abrirFicha(
      tester,
      servidorCon(
        fichaJson(fotoCierre: cierre, resueltoEn: '2026-11-08T18:20:00.000Z'),
        comentarios: [
          comentarioJson(1, 'Sigue igual', autor: autorJson(2), editado: true),
          comentarioJson(2, 'El mío', autor: autorJson(3), esMio: true),
        ],
      ),
      alto: 9000,
    );

    expect(find.text('Reportes (2)'), findsOneWidget);
    expect(find.text('Comentarios (2)'), findsOneWidget);
    expect(tester.takeException(), isNull);
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
    // La primera es la de los datos; la otra, la del paso «Resuelto».
    await tester.dragUntilVisible(
      find.text('8 de noviembre de 2026').first,
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    expect(
      find.ancestor(
        of: find.text('8 de noviembre de 2026').first,
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
            '/social/feed' => json(200, {
              'reportes': <Object>[],
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

  group('comentarios del problema', () {
    final caja = find.widgetWithText(TextField, 'Escribí un comentario');
    List<(String, String, Object?)> escrituras(ServidorFalso servidor) => [
      for (final p in servidor.pedidos)
        if (p.metodo != 'GET' && p.ruta.startsWith('/social'))
          (p.metodo, p.ruta, (p.datos as Map?)?['texto']),
    ];

    testWidgets('los lee y comenta: sale sin los espacios de los bordes y '
        'aparece en la lista', (tester) async {
      final servidor = servidorCon(
        fichaJson(),
        comentarios: [comentarioJson(1, 'Sigue igual', autor: autorJson(2))],
      );
      await abrirFicha(tester, servidor, alto: 3000);
      expect(find.text('Comentarios (1)'), findsOneWidget);
      expect(find.text('Sigue igual'), findsOneWidget);

      await tester.enterText(caja, '  Ya lo vi  ');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Comentar'));
      await tester.pumpAndSettle();

      expect(find.text('Ya lo vi'), findsOneWidget);
      expect(find.text('Comentarios (2)'), findsOneWidget);
      expect(escrituras(servidor), [
        ('POST', '/social/incidentes/3/comentarios', 'Ya lo vi'),
      ]);
    });

    testWidgets('TalkBack lee cada comentario de una vez', (tester) async {
      await abrirFicha(
        tester,
        servidorCon(
          fichaJson(),
          comentarios: [comentarioJson(1, 'Sigue igual', autor: autorJson(2))],
        ),
        alto: 3000,
      );

      expect(
        find.bySemanticsLabel(RegExp(r'^Vecino 2\n[^\n]+\nSigue igual$')),
        findsOneWidget,
      );
    });

    testWidgets('si el servidor lo rechaza, lo dice y no mueve nada', (
      tester,
    ) async {
      final servidor = servidorCon(
        fichaJson(),
        comentarios: [comentarioJson(1, 'Sigue igual', autor: autorJson(2))],
      );
      final responder = servidor.responder;
      servidor.responder = (pedido) =>
          pedido.method == 'POST' &&
              pedido.path == '/social/incidentes/3/comentarios'
          ? errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error en el servidor')
          : responder(pedido);
      await abrirFicha(tester, servidor, alto: 3000);

      await tester.enterText(caja, 'Ya lo vi');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Comentar'));
      await tester.pumpAndSettle();

      expect(find.text('Ocurrió un error en el servidor'), findsOneWidget);
      expect(find.text('Comentarios (1)'), findsOneWidget);
      // Lo escrito sigue en la caja, para reintentar.
      expect(tester.widget<TextField>(caja).controller?.text, 'Ya lo vi');
    });

    testWidgets('más de 1000 caracteres no se puede enviar', (tester) async {
      await abrirFicha(tester, servidorCon(fichaJson()), alto: 3000);
      expect(find.text('Todavía no hay comentarios.'), findsOneWidget);

      await tester.enterText(caja, 'a' * 1001);
      await tester.pump();

      expect(find.text('1001/1000'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Comentar'))
            .onPressed,
        isNull,
      );
    });

    testWidgets('edita su comentario y lo elimina después de confirmar', (
      tester,
    ) async {
      final servidor = servidorCon(
        fichaJson(),
        comentarios: [
          comentarioJson(1, 'Sigue igual', autor: autorJson(2)),
          comentarioJson(3, 'El mío', autor: autorJson(3), esMio: true),
        ],
      );
      await abrirFicha(tester, servidor, alto: 3000);
      // Solo el propio tiene el menú.
      expect(find.byTooltip('Opciones de tu comentario'), findsOneWidget);

      await tester.tap(find.byTooltip('Opciones de tu comentario'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Editar'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Comentario'),
        'El mío, corregido',
      );
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Guardar'));
      await tester.pumpAndSettle();
      expect(find.text('El mío, corregido'), findsOneWidget);

      await tester.tap(find.byTooltip('Opciones de tu comentario'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Eliminar'));
      await tester.pumpAndSettle();
      expect(find.text('¿Eliminar tu comentario?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Eliminar'));
      await tester.pumpAndSettle();

      expect(find.text('El mío, corregido'), findsNothing);
      expect(find.text('Comentarios (1)'), findsOneWidget);
      expect(escrituras(servidor), [
        ('PATCH', '/social/comentarios/3', 'El mío, corregido'),
        ('DELETE', '/social/comentarios/3', null),
      ]);
    });

    testWidgets('el operador los lee, pero no comenta ni los edita', (
      tester,
    ) async {
      await abrirFicha(
        tester,
        servidorCon(
          fichaJson(),
          rol: 'OPERADOR',
          comentarios: [comentarioJson(1, 'Sigue igual', autor: autorJson(2))],
        ),
        alto: 3000,
      );

      expect(find.text('Sigue igual'), findsOneWidget);
      expect(caja, findsNothing);
      expect(find.text('Ingresá para comentar'), findsNothing);
      expect(find.byTooltip('Opciones de tu comentario'), findsNothing);
    });

    testWidgets('sin sesión pide ingresar y al ingresar vuelve a la ficha '
        'con la caja', (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final servidor = servidorCon(fichaJson());
      await abrirFicha(tester, servidor, alto: 3000);
      expect(caja, findsNothing);

      await tester.tap(find.text('Ingresá para comentar'));
      await tester.pumpAndSettle();
      expect(find.byType(PantallaIngreso), findsOneWidget);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Correo'),
        'vecino1@snapit.test',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Clave'),
        'una-clave-cualquiera',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await tester.pumpAndSettle();

      expect(find.byType(PantallaIncidente), findsOneWidget);
      expect(caja, findsOneWidget);
      expect(escrituras(servidor), isEmpty);
    });
  });

  group('sigue estando', () {
    final botonSigue = find.widgetWithText(OutlinedButton, 'Sigue estando');
    final botonYaConfirmo = find.widgetWithText(
      OutlinedButton,
      'Ya confirmaste que sigue',
    );
    bool habilitado(WidgetTester tester, Finder boton) =>
        tester.widget<OutlinedButton>(boton).onPressed != null;
    Iterable<String> confirmaciones(ServidorFalso servidor) => [
      for (final p in servidor.pedidos)
        if (p.ruta == '/incidentes/3/confirmaciones') p.metodo,
    ];

    testWidgets('el vecino confirma: el contador suma uno y el botón queda '
        'deshabilitado diciéndolo', (tester) async {
      final servidor = servidorCon(fichaJson());
      await abrirFicha(tester, servidor, alto: 3000);
      expect(find.text('2 vecinos confirmaron que sigue'), findsOneWidget);
      expect(habilitado(tester, botonSigue), isTrue);

      await tester.tap(botonSigue);
      await tester.pumpAndSettle();

      expect(confirmaciones(servidor), ['POST']);
      expect(find.text('3 vecinos confirmaron que sigue'), findsOneWidget);
      expect(botonSigue, findsNothing);
      expect(habilitado(tester, botonYaConfirmo), isFalse);
      // La ficha no se vuelve a pedir: el contador es el que devolvió el
      // servidor al confirmar.
      expect(servidor.cantidad('/incidentes/3'), 1);
    });

    testWidgets('si ya confirmó, el botón aparece deshabilitado y lo dice, '
        'también para TalkBack', (tester) async {
      final servidor = servidorCon(fichaJson(), confirmado: true);
      await abrirFicha(tester, servidor, alto: 3000);

      expect(botonSigue, findsNothing);
      expect(habilitado(tester, botonYaConfirmo), isFalse);
      expect(
        tester.getSemantics(find.bySemanticsLabel('Ya confirmaste que sigue')),
        isSemantics(
          label: 'Ya confirmaste que sigue',
          isButton: true,
          hasEnabledState: true,
          isEnabled: false,
        ),
      );
      expect(confirmaciones(servidor), isEmpty);
    });

    testWidgets('si el servidor dice que ya lo había confirmado, lo avisa y '
        'el botón pasa a decirlo', (tester) async {
      // Por ejemplo, lo confirmó desde otro celular con la ficha abierta.
      final servidor = servidorCon(fichaJson());
      final responder = servidor.responder;
      var yaConfirmo = false;
      servidor.responder = (pedido) {
        switch (pedido.path) {
          case '/incidentes/3/confirmaciones':
            yaConfirmo = true;
            return errorApi(
              409,
              'YA_CONFIRMADO',
              'Ya confirmaste que este problema sigue',
            );
          case '/incidentes/3/confirmacion' when yaConfirmo:
            return json(200, {'confirmado': true});
        }
        return responder(pedido);
      };
      await abrirFicha(tester, servidor, alto: 3000);

      await tester.tap(botonSigue);
      await tester.pumpAndSettle();

      expect(
        find.text('Ya confirmaste que este problema sigue'),
        findsOneWidget,
      );
      expect(habilitado(tester, botonYaConfirmo), isFalse);
      expect(find.text('2 vecinos confirmaron que sigue'), findsOneWidget);
    });

    testWidgets('si el servidor lo rechaza por otra cosa, lo dice y deja el '
        'botón como estaba', (tester) async {
      final servidor = servidorCon(fichaJson());
      final responder = servidor.responder;
      servidor.responder = (pedido) =>
          pedido.path == '/incidentes/3/confirmaciones'
          ? errorApi(
              409,
              'INCIDENTE_CADUCADO',
              'El incidente caducó: ya no está vigente',
            )
          : responder(pedido);
      await abrirFicha(tester, servidor, alto: 3000);

      await tester.tap(botonSigue);
      await tester.pumpAndSettle();

      expect(
        find.text('El incidente caducó: ya no está vigente'),
        findsOneWidget,
      );
      expect(habilitado(tester, botonSigue), isTrue);
      expect(find.text('2 vecinos confirmaron que sigue'), findsOneWidget);
    });

    testWidgets('si no se sabe si ya lo confirmó, lo dice y deja reintentar', (
      tester,
    ) async {
      final servidor = servidorCon(fichaJson());
      final responder = servidor.responder;
      var fallar = true;
      servidor.responder = (pedido) {
        if (pedido.path == '/incidentes/3/confirmacion' && fallar) {
          fallar = false;
          return errorApi(
            500,
            'ERROR_INTERNO',
            'Ocurrió un error en el servidor',
          );
        }
        return responder(pedido);
      };
      await abrirFicha(tester, servidor, alto: 3000);

      expect(
        find.text('No se pudo saber si ya lo confirmaste.'),
        findsOneWidget,
      );
      expect(botonSigue, findsNothing);
      // El contador se ve igual: viene con la ficha.
      expect(find.text('2 vecinos confirmaron que sigue'), findsOneWidget);

      await tester.tap(find.text('Reintentar'));
      await tester.pumpAndSettle();

      expect(habilitado(tester, botonSigue), isTrue);
    });

    testWidgets('sin sesión invita a ingresar y después vuelve al detalle, '
        'sin confirmar solo', (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final servidor = servidorCon(fichaJson(confirmaciones: 0));
      await abrirFicha(tester, servidor, alto: 3000);
      expect(find.text('Nadie confirmó todavía que sigue'), findsOneWidget);
      expect(botonSigue, findsNothing);
      // Sin sesión no hay a quién preguntarle si confirmó.
      expect(servidor.cantidad('/incidentes/3/confirmacion'), 0);

      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Ingresá para confirmar que sigue'),
      );
      await tester.pumpAndSettle();
      expect(find.byType(PantallaIngreso), findsOneWidget);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Correo'),
        'vecino1@snapit.test',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Clave'),
        'una-clave-cualquiera',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await tester.pumpAndSettle();

      expect(find.byType(PantallaIncidente), findsOneWidget);
      expect(habilitado(tester, botonSigue), isTrue);
      expect(confirmaciones(servidor), isEmpty);
    });

    testWidgets('el operador ve solo el contador', (tester) async {
      final servidor = servidorCon(
        fichaJson(confirmaciones: 1),
        rol: 'OPERADOR',
      );
      await abrirFicha(tester, servidor, alto: 3000);

      expect(find.text('1 vecino confirmó que sigue'), findsOneWidget);
      expect(botonSigue, findsNothing);
      expect(botonYaConfirmo, findsNothing);
      expect(find.text('Ingresá para confirmar que sigue'), findsNothing);
      expect(servidor.cantidad('/incidentes/3/confirmacion'), 0);
    });

    testWidgets('resuelto no muestra ni el botón ni el contador', (
      tester,
    ) async {
      final servidor = servidorCon(
        fichaJson(fotoCierre: cierre, resueltoEn: '2026-11-08T18:20:00.000Z'),
      );
      await abrirFicha(tester, servidor, alto: 3000);

      expect(botonSigue, findsNothing);
      expect(find.textContaining('confirm'), findsNothing);
      expect(servidor.cantidad('/incidentes/3/confirmacion'), 0);
    });

    testWidgets(
      'con letra grande (2×) en un celular de 360 dp no se desborda',
      (tester) async {
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        FlutterSecureStorage.setMockInitialValues({});
        await abrirFicha(tester, servidorCon(fichaJson()), alto: 9000);

        expect(find.text('Ingresá para confirmar que sigue'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
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

  testWidgets('si no se sabe si lo sigue, lo dice y deja reintentar', (
    tester,
  ) async {
    final servidor = servidorCon(fichaJson());
    final responder = servidor.responder;
    var fallar = true;
    servidor.responder = (pedido) {
      if (pedido.path == '/incidentes/3/seguimiento' && fallar) {
        fallar = false;
        return errorApi(
          500,
          'ERROR_INTERNO',
          'Ocurrió un error en el servidor',
        );
      }
      return responder(pedido);
    };
    await abrirFicha(tester, servidor);

    expect(find.text('No se pudo saber si lo seguís.'), findsOneWidget);
    expect(find.text('Seguir'), findsNothing);

    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.text('Seguir'), findsOneWidget);
  });
}
