import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/feed/pantalla_incidente.dart';
import 'package:snapit/funcionalidades/feed/tarjeta_feed.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

Map<String, Object?> tarjetaJson(
  int id, {
  String categoria = 'Bache',
  int reportes = 1,
  int vecinos = 1,
  String severidad = 'MODERADA',
  String? direccion = 'Lanín 120, Villa Ceferino',
  List<int> fotos = const [1],
}) => {
  'id': id,
  'lat': -38.9516,
  'lon': -68.0591,
  'categoria': {'id': 1, 'nombre': categoria},
  'estado': 'VERIFICADO',
  'enRevision': false,
  'severidad': severidad,
  'primerReporteEn': '2026-10-06T15:15:33.494Z',
  'cantidadReportes': reportes,
  'cantidadVecinos': vecinos,
  'direccion': direccion,
  'resueltoEn': null,
  'fotos': [
    for (final foto in fotos) {'id': foto, 'url': '/api/fotos/$foto'},
  ],
  'cantidadFotos': fotos.length,
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
      if (pedido.ruta == '/incidentes/feed') pedido.consulta,
  ];

  Future<ResponseBody> _responder(RequestOptions pedido) {
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson()});
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/incidentes/feed':
        final cursor = pedido.queryParameters['cursor'] as String?;
        final numero = cursor == null ? 0 : int.parse(cursor.substring(1));
        if (numero == paginaQueFalla && fallarPagina != null) {
          return fallarPagina!(pedido);
        }
        return json(200, {
          'incidentes': paginas[numero],
          'siguiente': numero + 1 < paginas.length ? 'c${numero + 1}' : null,
        });
      case '/incidentes/3':
        return json(200, {
          ...tarjetaJson(3, categoria: 'Vereda rota', severidad: 'GRAVE'),
          'cantidadVecinos': 2,
          'fotos': [
            {'id': 5, 'url': '/api/fotos/5'},
            {'id': 6, 'url': '/api/fotos/6'},
          ],
        });
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }
}

void main() {
  setUp(guardarSesion);

  // Un celular de 360 × 780: entran una tarjeta y media por pantalla.
  Future<void> abrir(WidgetTester tester, ServidorFeed servidor) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await abrirApp(tester, servidor.servidor);
  }

  Future<void> scrollearHastaElFinal(WidgetTester tester) async {
    await tester.dragUntilVisible(
      find.textContaining('No hay más incidentes').hitTestable(),
      find.byType(ListView).first,
      const Offset(0, -500),
      maxIteration: 30,
    );
    await tester.pumpAndSettle();
  }

  testWidgets('cada tarjeta muestra categoría, dirección, estado, gravedad y '
      'cuántos vecinos lo reportaron', (tester) async {
    await abrir(
      tester,
      ServidorFeed([
        [
          tarjetaJson(1, severidad: 'GRAVE'),
          tarjetaJson(2, categoria: 'Vereda rota', reportes: 3, vecinos: 3),
        ],
      ]),
    );

    expect(find.byType(TarjetaIncidente), findsWidgets);
    expect(find.text('Bache'), findsOneWidget);
    expect(find.text('Lanín 120, Villa Ceferino'), findsWidgets);
    expect(find.text('Verificado'), findsWidgets);
    expect(find.text('Grave'), findsOneWidget);
    expect(find.text('Lo reportó 1 vecino'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp('^Foto 1 de 1 de Bache')),
      findsOneWidget,
    );

    await scrollearHastaElFinal(tester);
    expect(find.text('Vereda rota'), findsOneWidget);
    expect(
      find.text('Agrupado · 3 reportes del mismo problema'),
      findsOneWidget,
    );
    expect(find.text('Lo reportaron 3 vecinos'), findsOneWidget);
  });

  testWidgets('al llegar al final pide la página siguiente con el cursor', (
    tester,
  ) async {
    final servidor = ServidorFeed([
      [tarjetaJson(1), tarjetaJson(2)],
      [tarjetaJson(3, categoria: 'Vereda rota')],
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
      [tarjetaJson(1)],
      [tarjetaJson(3, categoria: 'Vereda rota')],
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
      [tarjetaJson(1)],
    ])..paginaQueFalla = 0;
    servidor.fallarPagina = (pedido) => sinConexion(pedido);
    await abrir(tester, servidor);

    expect(find.byType(TarjetaIncidente), findsNothing);
    servidor.fallarPagina = null;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.text('Bache'), findsOneWidget);
  });

  testWidgets('tocar una tarjeta abre su detalle con todas las fotos', (
    tester,
  ) async {
    await abrir(
      tester,
      ServidorFeed([
        [tarjetaJson(3, categoria: 'Vereda rota', severidad: 'GRAVE')],
      ]),
    );

    await tester.tap(find.text('Vereda rota'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaIncidente), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'Vereda rota'), findsOneWidget);
    expect(find.text('Grave'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp('^Foto 1 de 2 de Vereda rota')),
      findsOneWidget,
    );
    expect(find.text('1/2'), findsOneWidget);

    // El botón atrás del sistema.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(TarjetaIncidente), findsOneWidget);
  });
}
