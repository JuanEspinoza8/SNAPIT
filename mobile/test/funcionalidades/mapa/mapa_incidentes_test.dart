import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/compartido/formato/fechas.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';
import 'package:snapit/funcionalidades/mapa/mapa_incidentes.dart';
import 'package:snapit/funcionalidades/mapa/pantalla_mapa_publico.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

Map<String, Object?> incidenteJson(
  int id, {
  double lat = -38.9516,
  double lon = -68.0591,
  String categoria = 'Cordón sin rampa',
  String estado = 'REGISTRADO',
}) => {
  'id': id,
  'lat': lat,
  'lon': lon,
  'categoriaId': 3,
  'categoriaNombre': categoria,
  'estado': estado,
  'enRevision': estado == 'REGISTRADO',
  'primerReporteEn': '2026-10-06T15:15:33.494Z',
  'cantidadReportes': 1,
};

Map<String, Object?> fichaJson(int id) => {
  'id': id,
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

const categoriasJson = {
  'categorias': [
    {'id': 1, 'nombre': 'Bache'},
    {'id': 3, 'nombre': 'Cordón sin rampa'},
  ],
};

/// Un incidente en revisión en el centro y uno verificado a unos 800 m.
final dosIncidentes = [
  incidenteJson(9),
  incidenteJson(
    10,
    lat: -38.956,
    lon: -68.05,
    categoria: 'Bache',
    estado: 'VERIFICADO',
  ),
];

ServidorFalso servidorDelMapa([List<Map<String, Object?>>? incidentes]) {
  return ServidorFalso(
    (pedido) => switch (pedido.path) {
      '/incidentes' => json(200, {'incidentes': incidentes ?? dosIncidentes}),
      '/categorias' => json(200, categoriasJson),
      final ruta when ruta.startsWith('/incidentes/') => json(
        200,
        fichaJson(int.parse(ruta.split('/').last)),
      ),
      _ => errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe'),
    },
  );
}

/// La última consulta de puntos que hizo el mapa.
Map<String, dynamic> ultimaConsulta(ServidorFalso servidor) =>
    servidor.pedidos.lastWhere((p) => p.ruta == '/incidentes').consulta;

bool contiene(Map<String, dynamic> consulta, LatLng punto) {
  final [oeste, sur, este, norte] = (consulta['bbox'] as String)
      .split(',')
      .map(double.parse)
      .toList();
  return punto.longitude >= oeste &&
      punto.longitude <= este &&
      punto.latitude >= sur &&
      punto.latitude <= norte;
}

/// Abre la app sin sesión, en un celular de 360 × 780, y entra al mapa como
/// visitante.
Future<void> abrirMapa(
  WidgetTester tester,
  ServidorFalso servidor, {
  UbicacionFalsa? ubicacion,
}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await abrirApp(tester, servidor, ubicacion: ubicacion);
  await tester.tap(find.text('Ver el mapa sin ingresar'));
  await esperarAlMapa(tester);
}

/// El mapa pide los puntos cuando se queda quieto (300 ms).
Future<void> esperarAlMapa(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pumpAndSettle();
}

/// Toca un marcador y espera a que se resuelva el toque: el mapa espera un
/// posible doble toque antes de soltarlo.
Future<void> tocar(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('el visitante ve el mapa de Neuquén sin iniciar sesión', (
    tester,
  ) async {
    final servidor = servidorDelMapa();
    await abrirMapa(tester, servidor);

    expect(find.byType(PantallaMapaPublico), findsOneWidget);
    expect(find.text('2 incidentes en esta zona'), findsOneWidget);
    final pedido = servidor.pedidos.lastWhere((p) => p.ruta == '/incidentes');
    expect(pedido.token, isNull);
    expect(contiene(pedido.consulta, centroInicial), isTrue);
  });

  testWidgets('cada marcador dice su estado con texto, no solo con color', (
    tester,
  ) async {
    await abrirMapa(tester, servidorDelMapa());

    expect(
      find.bySemanticsLabel('Cordón sin rampa, En revisión'),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Bache, Verificado'), findsOneWidget);

    await tester.tap(find.byTooltip('Referencias'));
    await tester.pumpAndSettle();
    for (final texto in [
      'En revisión',
      'Verificado',
      'Derivado al área',
      'En ejecución',
      'Resuelto',
    ]) {
      expect(find.text(texto), findsOneWidget);
    }
  });

  testWidgets('tocar un punto abre su ficha con la etiqueta «En revisión»', (
    tester,
  ) async {
    final servidor = servidorDelMapa();
    await abrirMapa(tester, servidor);

    await tocar(tester, find.bySemanticsLabel('Cordón sin rampa, En revisión'));

    expect(find.text('Cordón sin rampa'), findsOneWidget);
    expect(find.text('En revisión'), findsOneWidget);
    expect(
      find.text(
        'Todavía no se verificó: puede cambiar de categoría o descartarse.',
      ),
      findsOneWidget,
    );
    expect(find.text('6 de octubre de 2026'), findsOneWidget);
    expect(find.text('Vecinos que lo reportaron'), findsOneWidget);
    // En los tests no hay red: en lugar de la foto se ve el aviso, y la
    // descripción se lee igual.
    expect(find.text('No se pudo cargar la foto'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp('^Foto 1 de 1 de Cordón sin rampa')),
      findsOneWidget,
    );
    final pedido = servidor.pedidos.last;
    expect(pedido.ruta, '/incidentes/9');
    expect(pedido.token, isNull);
  });

  testWidgets('al alejar se agrupan; tocar el grupo acerca y los separa', (
    tester,
  ) async {
    // A unos 200 m: al zoom inicial (14) caen en el mismo grupo.
    final cercanos = [
      incidenteJson(1),
      incidenteJson(2, lon: -68.0568, categoria: 'Bache'),
    ];
    await abrirMapa(tester, servidorDelMapa(cercanos));

    final grupo = find.bySemanticsLabel(
      '2 incidentes juntos. Tocá para acercar.',
    );
    expect(grupo, findsOneWidget);

    await tocar(tester, grupo);

    expect(grupo, findsNothing);
    expect(
      find.bySemanticsLabel('Cordón sin rampa, En revisión'),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Bache, En revisión'), findsOneWidget);
  });

  testWidgets('los incidentes en el mismo lugar se eligen de una lista', (
    tester,
  ) async {
    final mismoLugar = [
      incidenteJson(1),
      incidenteJson(2, categoria: 'Bache', estado: 'VERIFICADO'),
    ];
    final servidor = servidorDelMapa(mismoLugar);
    await abrirMapa(tester, servidor);

    // Ni al zoom máximo se separan: se ofrecen como lista desde el principio.
    expect(find.bySemanticsLabel(RegExp('juntos')), findsNothing);
    await tocar(
      tester,
      find.bySemanticsLabel(
        '2 incidentes en el mismo lugar. Tocá para ver la lista.',
      ),
    );
    expect(find.text('2 incidentes en este lugar'), findsOneWidget);

    await tester.tap(find.text('Bache'));
    await tester.pumpAndSettle();

    expect(servidor.pedidos.last.ruta, '/incidentes/2');
  });

  testWidgets('los filtros viajan en la consulta con el formato de la API', (
    tester,
  ) async {
    final servidor = servidorDelMapa();
    await abrirMapa(tester, servidor);

    await tester.tap(find.text('Filtros'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Todas'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bache').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Todos'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Verificado').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cualquier fecha').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('1'));
    await tester.tap(find.text('Aceptar'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Aplicar filtros'));
    await esperarAlMapa(tester);

    final hoy = DateTime.now();
    expect(ultimaConsulta(servidor), {
      'bbox': isA<String>(),
      'categoriaId': '1',
      'estado': 'VERIFICADO',
      'desde': fechaApi(DateTime(hoy.year, hoy.month)),
    });
    expect(find.text('Filtros (3)'), findsOneWidget);

    await tester.tap(find.text('Filtros (3)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Limpiar filtros'));
    await esperarAlMapa(tester);

    expect(ultimaConsulta(servidor).keys, ['bbox']);
    expect(find.text('Filtros'), findsOneWidget);
  });

  testWidgets('sin incidentes en la zona lo dice y sugiere qué hacer', (
    tester,
  ) async {
    await abrirMapa(tester, servidorDelMapa([]));

    expect(
      find.text('No hay incidentes en esta zona. Mové el mapa para ver otra.'),
      findsOneWidget,
    );
  });

  testWidgets('sin conexión avisa y deja reintentar', (tester) async {
    final servidor = servidorDelMapa();
    final responder = servidor.responder;
    servidor.responder = (pedido) =>
        pedido.path == '/incidentes' ? sinConexion(pedido) : responder(pedido);
    await abrirMapa(tester, servidor);

    expect(find.textContaining('No se pudo conectar'), findsOneWidget);

    servidor.responder = responder;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.textContaining('No se pudo conectar'), findsNothing);
    expect(find.text('2 incidentes en esta zona'), findsOneWidget);
  });

  testWidgets('con permiso de ubicación se centra donde está la persona', (
    tester,
  ) async {
    const cipolletti = LatLng(-38.9339, -67.9903);
    final servidor = servidorDelMapa();
    final ubicacion = UbicacionFalsa(cipolletti);

    await abrirMapa(tester, servidor, ubicacion: ubicacion);

    expect(ubicacion.pedidos, 1);
    expect(contiene(ultimaConsulta(servidor), cipolletti), isTrue);
    expect(contiene(ultimaConsulta(servidor), centroInicial), isFalse);
  });

  testWidgets('sin permiso de ubicación se queda en Neuquén', (tester) async {
    final servidor = servidorDelMapa();
    final ubicacion = UbicacionFalsa();

    await abrirMapa(tester, servidor, ubicacion: ubicacion);

    expect(ubicacion.pedidos, 1);
    expect(contiene(ultimaConsulta(servidor), centroInicial), isTrue);
  });

  testWidgets('«Ingresar» vuelve al ingreso', (tester) async {
    await abrirMapa(tester, servidorDelMapa());

    await tester.tap(find.text('Ingresar'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaIngreso), findsOneWidget);
  });

  testWidgets('un error del servidor en la ficha deja reintentar', (
    tester,
  ) async {
    final servidor = servidorDelMapa();
    final responder = servidor.responder;
    servidor.responder = (pedido) => pedido.path == '/incidentes/9'
        ? errorApi(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe')
        : responder(pedido);
    await abrirMapa(tester, servidor);

    await tocar(tester, find.bySemanticsLabel('Cordón sin rampa, En revisión'));
    expect(find.text('El incidente no existe'), findsOneWidget);

    servidor.responder = responder;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.text('Vecinos que lo reportaron'), findsOneWidget);
  });
}
