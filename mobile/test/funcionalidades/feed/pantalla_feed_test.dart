import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/feed/pantalla_incidente.dart';
import 'package:snapit/funcionalidades/feed/pantalla_reporte.dart';
import 'package:snapit/funcionalidades/feed/tarjeta_publicacion.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

/// Una publicación del feed (`GET /social/feed`): el reporte [id] del
/// incidente [incidente].
Map<String, Object?> publicacionJson(
  int id, {
  String categoria = 'Bache',
  int incidente = 3,
  int vecinos = 1,
  String estado = 'VERIFICADO',
  String severidad = 'MODERADA',
  String? direccion = 'Lanín 120, Villa Ceferino',
  String? descripcion,
  Object? derivadoA = const {'id': 4, 'nombre': 'Bacheo'},
  int numeroAutor = 1,
  int meGusta = 0,
  int comentarios = 0,
  bool yaMeGusta = false,
  List<int>? fotos,
}) => {
  'id': id,
  'incidenteId': incidente,
  'descripcion': descripcion,
  'creadoEn': '2026-10-06T15:15:33.494Z',
  'autor': {'numero': numeroAutor, 'nombre': 'Vecino $numeroAutor'},
  'fotos': [
    for (final foto in fotos ?? [id * 10])
      {'id': foto, 'url': '/api/fotos/$foto'},
  ],
  'cantidadMeGusta': meGusta,
  'cantidadComentarios': comentarios,
  'yaMeGusta': yaMeGusta,
  'categoria': {'id': 1, 'nombre': categoria},
  'severidad': severidad,
  'direccion': direccion,
  'lat': -38.9516,
  'lon': -68.0591,
  'derivadoA': derivadoA,
  'incidente': {
    'id': incidente,
    'estado': estado,
    'resueltoEn': estado == 'RESUELTO' ? '2026-11-05T15:00:00.000Z' : null,
    'cantidadVecinos': vecinos,
  },
};

/// El servidor de una sesión de vecino. [paginas] son las respuestas del feed
/// en orden: la primera sin cursor, la segunda con el cursor `c1`, y así.
class ServidorFeed {
  ServidorFeed(this.paginas) {
    servidor = ServidorFalso(_responder);
  }

  late final ServidorFalso servidor;
  final List<List<Map<String, Object?>>> paginas;

  /// Si no es null, responde la página con ese número así.
  Future<ResponseBody> Function(RequestOptions pedido)? fallarPagina;
  int? paginaQueFalla;

  List<Map<String, dynamic>> get consultasFeed => [
    for (final pedido in servidor.pedidos)
      if (pedido.ruta == '/social/feed') pedido.consulta,
  ];

  Future<ResponseBody> _responder(RequestOptions pedido) {
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson()});
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/social/feed':
        final cursor = pedido.queryParameters['cursor'] as String?;
        final numero = cursor == null ? 0 : int.parse(cursor.substring(1));
        if (numero == paginaQueFalla && fallarPagina != null) {
          return fallarPagina!(pedido);
        }
        return json(200, {
          'reportes': paginas[numero],
          'siguiente': numero + 1 < paginas.length ? 'c${numero + 1}' : null,
        });
      case '/incidentes/3':
        return json(200, {
          'id': 3,
          'lat': -38.9516,
          'lon': -68.0591,
          'categoria': {'id': 1, 'nombre': 'Vereda rota'},
          'estado': 'VERIFICADO',
          'enRevision': false,
          'severidad': 'GRAVE',
          'primerReporteEn': '2026-10-06T15:15:33.494Z',
          'cantidadReportes': 1,
          'cantidadVecinos': 1,
          'direccion': null,
          'fotos': [
            {'id': 5, 'url': '/api/fotos/5'},
          ],
          'fotoCierre': null,
          'resueltoEn': null,
        });
      case '/incidentes/3/seguimiento':
        return json(200, {'siguiendo': false});
      case '/social/reportes/1':
        return json(200, publicacionJson(1));
      case '/social/reportes/1/comentarios':
        return json(200, {'comentarios': <Object>[]});
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }
}

void main() {
  setUp(guardarSesion);

  // Un celular de 360 × 780: entra una publicación por pantalla.
  Future<void> abrir(WidgetTester tester, ServidorFeed servidor) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await abrirApp(tester, servidor.servidor);
  }

  Future<void> scrollearHastaElFinal(WidgetTester tester) async {
    await tester.dragUntilVisible(
      find.textContaining('No hay más publicaciones').hitTestable(),
      find.byType(ListView).first,
      const Offset(0, -500),
      maxIteration: 30,
    );
    await tester.pumpAndSettle();
  }

  testWidgets('cada publicación muestra el autor, la foto, el problema y la '
      'línea a su incidente', (tester) async {
    await abrir(
      tester,
      ServidorFeed([
        [
          publicacionJson(
            1,
            severidad: 'GRAVE',
            descripcion: 'Pozo enorme',
            meGusta: 7,
            comentarios: 4,
          ),
          publicacionJson(
            2,
            categoria: 'Vereda rota',
            incidente: 8,
            vecinos: 3,
            estado: 'EN_EJECUCION',
            numeroAutor: 2,
          ),
        ],
      ]),
    );

    expect(find.byType(TarjetaPublicacion), findsWidgets);
    expect(find.text('Vecino 1'), findsOneWidget);
    expect(find.textContaining('Lanín 120, Villa Ceferino'), findsWidgets);
    expect(find.text('Bache'), findsOneWidget);
    expect(find.text('Grave'), findsOneWidget);
    expect(find.text('Pozo enorme'), findsOneWidget);
    expect(
      find.text('Le corresponde al área de Bacheo', findRichText: true),
      findsWidgets,
    );
    expect(find.bySemanticsLabel('Me gusta, 7 me gusta'), findsOneWidget);
    expect(find.bySemanticsLabel('Ver 4 comentarios'), findsOneWidget);
    // Un solo vecino: el problema ya está en la publicación.
    expect(find.text('Estado del problema'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        RegExp('^Foto 1 de 1 de Bache, reporte del Vecino 1'),
      ),
      findsOneWidget,
    );

    await scrollearHastaElFinal(tester);
    expect(find.text('Vereda rota'), findsOneWidget);
    expect(find.text('3 vecinos reportaron este problema'), findsOneWidget);
    expect(find.text('En ejecución'), findsOneWidget);
  });

  testWidgets('con letra grande (2×) en un celular de 360 dp no se desborda, '
      'también con varios vecinos', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    // Alto de sobra para que todas las tarjetas se armen sin scrollear.
    tester.view.physicalSize = const Size(1080, 3 * 6000);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await abrirApp(
      tester,
      ServidorFeed([
        [
          publicacionJson(
            1,
            vecinos: 3,
            estado: 'EN_EJECUCION',
            descripcion: 'Pozo enorme frente a la escuela',
            meGusta: 12,
            comentarios: 4,
          ),
          publicacionJson(2, vecinos: 2, estado: 'RESUELTO', numeroAutor: 2),
          publicacionJson(3, categoria: 'Cordón sin rampa'),
        ],
      ]).servidor,
    );

    expect(find.byType(TarjetaPublicacion), findsNWidgets(3));
    expect(find.text('3 vecinos reportaron este problema'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('un problema resuelto lo dice arriba de la publicación', (
    tester,
  ) async {
    await abrir(
      tester,
      ServidorFeed([
        [publicacionJson(1, estado: 'RESUELTO')],
      ]),
    );

    // Arriba y en la línea al incidente.
    expect(find.text('Resuelto'), findsNWidgets(2));
  });

  testWidgets('al llegar al final pide la página siguiente con el cursor', (
    tester,
  ) async {
    final servidor = ServidorFeed([
      [publicacionJson(1), publicacionJson(2)],
      [publicacionJson(3, categoria: 'Vereda rota')],
    ]);
    await abrir(tester, servidor);
    expect(servidor.consultasFeed, hasLength(1));
    expect(servidor.consultasFeed.first.containsKey('cursor'), isFalse);

    await scrollearHastaElFinal(tester);

    expect(servidor.consultasFeed.map((c) => c['cursor']), [null, 'c1']);
    expect(find.text('Vereda rota'), findsOneWidget);
  });

  testWidgets('si falla la página siguiente, lo cargado sigue y deja '
      'reintentar', (tester) async {
    final servidor = ServidorFeed([
      [publicacionJson(1)],
      [publicacionJson(3, categoria: 'Vereda rota')],
    ])..paginaQueFalla = 1;
    servidor.fallarPagina = (pedido) => sinConexion(pedido);
    await abrir(tester, servidor);

    await tester.dragUntilVisible(
      find.text('Reintentar').hitTestable(),
      find.byType(ListView).first,
      const Offset(0, -500),
    );
    await tester.pumpAndSettle();
    expect(find.text('Bache'), findsOneWidget);

    servidor.fallarPagina = null;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.text('Vereda rota'), findsOneWidget);
    expect(find.text('Reintentar'), findsNothing);
  });

  testWidgets('si no carga, lo dice y deja reintentar', (tester) async {
    final servidor = ServidorFeed([
      [publicacionJson(1)],
    ])..paginaQueFalla = 0;
    servidor.fallarPagina = (pedido) => sinConexion(pedido);
    await abrir(tester, servidor);

    expect(find.byType(TarjetaPublicacion), findsNothing);
    servidor.fallarPagina = null;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.text('Bache'), findsOneWidget);
  });

  testWidgets('sin publicaciones lo dice', (tester) async {
    await abrir(tester, ServidorFeed([[]]));

    expect(find.text('Todavía no hay publicaciones'), findsOneWidget);
  });

  testWidgets('tocar en cualquier parte de la tarjeta abre la publicación', (
    tester,
  ) async {
    await abrir(
      tester,
      ServidorFeed([
        [publicacionJson(1, descripcion: 'Pozo enorme')],
      ]),
    );

    await tester.tap(find.text('Pozo enorme'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaReporte), findsOneWidget);
  });

  testWidgets('el autor abre la publicación, y con varios vecinos la línea '
      'abre el problema', (tester) async {
    await abrir(
      tester,
      ServidorFeed([
        [publicacionJson(1, vecinos: 3)],
      ]),
    );

    await tester.tap(find.text('Vecino 1'));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaReporte), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    await tester.tap(find.text('3 vecinos reportaron este problema'));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaIncidente), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'Vereda rota'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(TarjetaPublicacion), findsOneWidget);
  });
}
