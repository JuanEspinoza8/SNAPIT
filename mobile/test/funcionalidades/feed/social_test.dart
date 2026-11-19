import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';
import 'package:snapit/funcionalidades/feed/pantalla_reporte.dart';
import 'package:snapit/funcionalidades/feed/social.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

Map<String, Object?> autorJson(int numero) => {
  'numero': numero,
  'nombre': 'Vecino $numero',
};

const snapitJson = {'numero': null, 'nombre': 'SnapIt', 'sistema': true};

Map<String, Object?> comentarioJson(
  int id,
  String texto, {
  required Map<String, Object?> autor,
  bool editado = false,
  bool esMio = false,
}) => {
  'id': id,
  'texto': texto,
  'creadoEn': '2026-10-07T15:15:33.494Z',
  'editadoEn': editado ? '2026-10-08T15:15:33.494Z' : null,
  'autor': autor,
  'esMio': esMio,
};

/// La publicación 31 (del Vecino 1, en el incidente 3), con sus me gusta y
/// sus comentarios. Responde a dar me gusta, comentar, editar y eliminar como
/// el servidor real, y guarda lo que recibió.
class ServidorPublicacion {
  ServidorPublicacion({
    this.rol = 'VECINO',
    List<Map<String, Object?>>? comentarios,
  }) : comentarios =
           comentarios ??
           [
             comentarioJson(
               1,
               '¡Gracias por tu reporte! Ya fue derivado al área de Veredas.',
               autor: snapitJson,
             ),
             comentarioJson(2, 'Confirmo, sigue igual', autor: autorJson(2)),
             comentarioJson(
               3,
               'El mío',
               autor: autorJson(3),
               editado: true,
               esMio: true,
             ),
           ] {
    servidor = ServidorFalso(_responder);
  }

  final String rol;
  late final ServidorFalso servidor;
  final List<Map<String, Object?>> comentarios;
  var meGusta = 5;

  /// Cuántos vecinos reportaron el problema (el incidente 3).
  var vecinos = 1;
  var yaMeGusta = false;

  /// Si no es null, dar o quitar el me gusta responde así.
  Future<ResponseBody> Function(RequestOptions pedido)? fallarMeGusta;

  /// Lo que se escribió: método, ruta y el texto del comentario, si hay.
  List<(String, String, Object?)> get escrituras => [
    for (final p in servidor.pedidos)
      if (p.metodo != 'GET' && p.ruta.startsWith('/social'))
        (p.metodo, p.ruta, (p.datos as Map?)?['texto']),
  ];

  Future<ResponseBody> _responder(RequestOptions pedido) {
    switch ((pedido.method, pedido.path)) {
      case (_, '/auth/yo'):
        return json(200, {'usuario': usuarioJson(rol: rol)});
      case (_, '/incidentes'):
        return json(200, {'incidentes': <Object>[]});
      case (_, '/social/feed'):
        return json(200, {'reportes': <Object>[], 'siguiente': null});
      case ('GET', '/social/reportes/31'):
        return json(200, {
          'id': 31,
          'incidenteId': 3,
          'descripcion': 'Frente al kiosco',
          'creadoEn': '2026-10-06T15:15:33.494Z',
          'autor': autorJson(1),
          'fotos': [
            {'id': 310, 'url': '/api/fotos/310'},
          ],
          'cantidadMeGusta': meGusta,
          'cantidadComentarios': comentarios.length,
          'yaMeGusta': yaMeGusta,
        });
      case ('GET', '/incidentes/3'):
        return json(200, {
          'id': 3,
          'lat': -38.9516,
          'lon': -68.0591,
          'categoria': {'id': 2, 'nombre': 'Vereda rota'},
          'estado': 'DERIVADO',
          'enRevision': false,
          'severidad': 'GRAVE',
          'primerReporteEn': '2026-10-06T15:15:33.494Z',
          'cantidadReportes': vecinos,
          'cantidadVecinos': vecinos,
          'direccion': 'Lanín 120, Villa Ceferino',
          'fotos': [
            {'id': 310, 'url': '/api/fotos/310'},
          ],
          'fotoCierre': null,
          'resueltoEn': null,
          'derivadoA': {'id': 2, 'nombre': 'Veredas'},
        });
      case ('GET', '/incidentes/3/seguimiento'):
        return json(200, {'siguiendo': false});
      case ('GET', '/social/reportes/31/comentarios'):
        return json(200, {'comentarios': comentarios});
      case (final metodo, '/social/reportes/31/me-gusta'):
        if (fallarMeGusta case final fallar?) return fallar(pedido);
        final dar = metodo == 'POST';
        if (dar != yaMeGusta) meGusta += dar ? 1 : -1;
        yaMeGusta = dar;
        return json(200, {
          'reporteId': 31,
          'cantidadMeGusta': meGusta,
          'yaMeGusta': yaMeGusta,
        });
      case ('POST', '/social/reportes/31/comentarios'):
        final texto = (pedido.data as Map)['texto'] as String;
        final nuevo = comentarioJson(
          9,
          texto,
          autor: autorJson(3),
          esMio: true,
        );
        comentarios.add(nuevo);
        return json(201, nuevo);
      case ('PATCH', final ruta) when ruta.startsWith('/social/comentarios/'):
        final id = int.parse(ruta.split('/').last);
        final i = comentarios.indexWhere((c) => c['id'] == id);
        comentarios[i] = {
          ...comentarios[i],
          'texto': (pedido.data as Map)['texto'],
          'editadoEn': '2026-10-09T15:15:33.494Z',
        };
        return json(200, comentarios[i]);
      case ('DELETE', final ruta) when ruta.startsWith('/social/comentarios/'):
        final id = int.parse(ruta.split('/').last);
        comentarios.removeWhere((c) => c['id'] == id);
        return json(204, '');
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }
}

void main() {
  // Alto de sobra para que la publicación entre entera sin scrollear.
  Future<void> abrir(WidgetTester tester, ServidorPublicacion servidor) async {
    tester.view.physicalSize = const Size(1080, 7000);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final contenedor = await abrirApp(tester, servidor.servidor);
    contenedor.read(rutasProvider).push(Rutas.reporte(31));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaReporte), findsOneWidget);
  }

  final caja = find.widgetWithText(TextField, 'Escribí un comentario');

  group('con sesión de vecino', () {
    setUp(guardarSesion);

    testWidgets('muestra el autor, la descripción y los comentarios, con el '
        'de SnapIt marcado como cuenta oficial', (tester) async {
      await abrir(tester, ServidorPublicacion());

      expect(
        find.widgetWithText(AppBar, 'Reporte del Vecino 1'),
        findsOneWidget,
      );
      expect(find.text('Frente al kiosco'), findsOneWidget);
      expect(find.text('Comentarios (3)'), findsOneWidget);
      expect(find.text('Confirmo, sigue igual'), findsOneWidget);
      expect(find.textContaining('editado'), findsOneWidget);
      expect(find.text('SnapIt'), findsOneWidget);
      expect(find.byIcon(Icons.verified), findsOneWidget);
    });

    testWidgets('muestra el problema sin ir a otra pantalla: qué es, en qué '
        'está, sus datos y el mapa', (tester) async {
      await abrir(tester, ServidorPublicacion());

      expect(find.text('Vereda rota'), findsOneWidget);
      // La etiqueta del estado y el paso del recorrido.
      expect(find.text('Derivado al área'), findsNWidgets(2));
      expect(
        find.text('Derivado al área de Veredas', findRichText: true),
        findsOneWidget,
      );
      expect(find.text('Lanín 120, Villa Ceferino'), findsOneWidget);
      expect(
        find.bySemanticsLabel(RegExp('^Mapa con la ubicación del incidente')),
        findsOneWidget,
      );
      expect(find.text('Estado del problema'), findsOneWidget);
      expect(find.text('Seguir'), findsOneWidget);
      // Lo reportó solo este vecino: no hay a dónde más ir.
      expect(find.textContaining('reportaron este problema'), findsNothing);
    });

    testWidgets('si lo reportaron otros vecinos, lleva a la ficha que junta '
        'todos', (tester) async {
      await abrir(tester, ServidorPublicacion()..vecinos = 3);

      expect(
        find.text('Otros 2 vecinos reportaron este problema'),
        findsOneWidget,
      );
    });

    testWidgets('da y quita el me gusta, y TalkBack dice si está dado', (
      tester,
    ) async {
      final servidor = ServidorPublicacion();
      await abrir(tester, servidor);

      await tester.tap(find.bySemanticsLabel('Me gusta, 5 me gusta'));
      await tester.pumpAndSettle();
      expect(
        tester.getSemantics(
          find.bySemanticsLabel('Quitar me gusta, 6 me gusta'),
        ),
        isSemantics(isButton: true, isToggled: true, hasToggledState: true),
      );

      await tester.tap(find.bySemanticsLabel('Quitar me gusta, 6 me gusta'));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Me gusta, 5 me gusta'), findsOneWidget);
      expect(servidor.escrituras.map((e) => e.$1), ['POST', 'DELETE']);
    });

    testWidgets('si el servidor rechaza el me gusta, lo dice y el contador '
        'queda como estaba', (tester) async {
      final servidor = ServidorPublicacion()
        ..fallarMeGusta = (_) =>
            errorApi(500, 'ERROR_INTERNO', 'Algo salió mal');
      await abrir(tester, servidor);

      await tester.tap(find.bySemanticsLabel('Me gusta, 5 me gusta'));
      await tester.pumpAndSettle();

      expect(find.text('Algo salió mal'), findsOneWidget);
      expect(find.bySemanticsLabel('Me gusta, 5 me gusta'), findsOneWidget);
    });

    testWidgets('comenta: sale sin los espacios de los bordes y aparece en la '
        'lista', (tester) async {
      final servidor = ServidorPublicacion();
      await abrir(tester, servidor);

      await tester.enterText(caja, '  Sigue ahí  ');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Comentar'));
      await tester.pumpAndSettle();

      expect(find.text('Sigue ahí'), findsOneWidget);
      expect(find.text('Comentarios (4)'), findsOneWidget);
      expect(servidor.escrituras, [
        ('POST', '/social/reportes/31/comentarios', 'Sigue ahí'),
      ]);
    });

    testWidgets('un comentario de más de 1000 caracteres no se puede enviar', (
      tester,
    ) async {
      await abrir(tester, ServidorPublicacion());

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

    testWidgets('edita su comentario', (tester) async {
      final servidor = ServidorPublicacion();
      await abrir(tester, servidor);
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
      expect(servidor.escrituras, [
        ('PATCH', '/social/comentarios/3', 'El mío, corregido'),
      ]);
    });

    testWidgets('elimina su comentario después de confirmar', (tester) async {
      final servidor = ServidorPublicacion();
      await abrir(tester, servidor);

      await tester.tap(find.byTooltip('Opciones de tu comentario'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Eliminar'));
      await tester.pumpAndSettle();
      expect(find.text('¿Eliminar tu comentario?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Eliminar'));
      await tester.pumpAndSettle();

      expect(find.text('El mío'), findsNothing);
      expect(find.text('Comentarios (2)'), findsOneWidget);
      expect(servidor.escrituras.single.$1, 'DELETE');
    });
  });

  testWidgets('el operador ve el contador, pero no da me gusta ni comenta', (
    tester,
  ) async {
    guardarSesion();
    await abrir(
      tester,
      ServidorPublicacion(
        rol: 'OPERADOR',
        comentarios: [
          comentarioJson(2, 'Confirmo, sigue igual', autor: autorJson(2)),
        ],
      ),
    );

    expect(find.bySemanticsLabel('5 me gusta'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('^Me gusta')), findsNothing);
    expect(caja, findsNothing);
    expect(find.byTooltip('Opciones de tu comentario'), findsNothing);
  });

  testWidgets('sin sesión, el me gusta lleva al ingreso y al ingresar vuelve '
      'a la publicación', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    final servidor = ServidorPublicacion(
      comentarios: [
        comentarioJson(2, 'Confirmo, sigue igual', autor: autorJson(2)),
      ],
    );
    servidor.servidor.responder = (pedido) => pedido.path == '/auth/ingreso'
        ? ingresoCorrecto()
        : servidor._responder(pedido);
    await abrir(tester, servidor);
    expect(find.text('Ingresá para comentar'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Me gusta, 5 me gusta'));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaIngreso), findsOneWidget);
    expect(servidor.escrituras, isEmpty);

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

    expect(find.byType(PantallaReporte), findsOneWidget);
    expect(caja, findsOneWidget);
  });

  test('SnapIt llega sin número y marcado como sistema', () {
    final autor = Autor.desdeJson(snapitJson);

    expect(autor.numero, isNull);
    expect(autor.sistema, isTrue);
  });

  test('del autor solo llegan su número y su alias en el incidente', () {
    final autor = Autor.desdeJson({'numero': 3, 'nombre': 'Vecino 3'});

    expect(autor.numero, 3);
    expect(autor.nombre, 'Vecino 3');
  });
}
