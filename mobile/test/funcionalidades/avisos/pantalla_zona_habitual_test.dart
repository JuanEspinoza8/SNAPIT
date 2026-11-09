import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/funcionalidades/avisos/modelos.dart';
import 'package:snapit/funcionalidades/avisos/pantalla_zona_habitual.dart';
import 'package:snapit/funcionalidades/mapa/mapa_incidentes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/avisos.dart';
import '../../apoyo/recorrido.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(guardarSesion);

  Future<void> abrirZona(
    WidgetTester tester,
    ServidorAvisos servidor, {
    ZonaHabitual? zona,
    UbicacionFalsa? ubicacion,
  }) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final contenedor = await abrirApp(
      tester,
      servidor.servidor,
      ubicacion: ubicacion ?? UbicacionFalsa(origenEnZona),
    );
    contenedor.read(rutasProvider).push(Rutas.zonaHabitual, extra: zona);
    await tester.pumpAndSettle();
    expect(find.byType(PantallaZonaHabitual), findsOneWidget);
  }

  Future<void> tocar(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('crear una zona manda el nombre, el centro y el radio', (
    tester,
  ) async {
    final servidor = ServidorAvisos();
    await abrirZona(tester, servidor);

    expect(find.widgetWithText(AppBar, 'Nueva zona'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), 'Casa');
    await tocar(tester, find.text('Crear zona'));

    final creada = servidor.servidor.pedidos.singleWhere(
      (pedido) => pedido.metodo == 'POST' && pedido.ruta == '/zonas-habituales',
    );
    expect(creada.datos, {
      'nombre': 'Casa',
      'lat': origenEnZona.latitude,
      'lon': origenEnZona.longitude,
      'radioMetros': 300,
      'activa': true,
    });
    expect(find.byType(PantallaZonaHabitual), findsNothing);
  });

  testWidgets('sin nombre no manda nada y pide el nombre', (tester) async {
    final servidor = ServidorAvisos();
    await abrirZona(tester, servidor);

    await tocar(tester, find.text('Crear zona'));

    expect(find.text('Poné un nombre.'), findsOneWidget);
    expect(servidor.pedidosZonas, 0);
  });

  testWidgets('el radio se puede cambiar antes de crear', (tester) async {
    final servidor = ServidorAvisos();
    await abrirZona(tester, servidor);

    await tester.drag(find.byType(Slider), const Offset(120, 0));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'Casa');
    await tocar(tester, find.text('Crear zona'));

    final creada = servidor.servidor.pedidos.singleWhere(
      (pedido) => pedido.metodo == 'POST' && pedido.ruta == '/zonas-habituales',
    );
    expect((creada.datos as Map)['radioMetros'], greaterThan(300));
    expect((creada.datos as Map)['radioMetros'], lessThanOrEqualTo(5000));
  });

  testWidgets('tocar el mapa mueve el centro de la zona', (tester) async {
    final servidor = ServidorAvisos();
    await abrirZona(tester, servidor);

    final centroDelMapa = tester.getCenter(find.byType(FlutterMap));
    await tester.tapAt(centroDelMapa + const Offset(40, 40));
    // El mapa espera a ver si es doble toque antes de avisar el toque simple.
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField), 'Casa');
    await tocar(tester, find.text('Crear zona'));

    final creada = servidor.servidor.pedidos.singleWhere(
      (pedido) => pedido.metodo == 'POST' && pedido.ruta == '/zonas-habituales',
    );
    expect((creada.datos as Map)['lat'], isNot(origenEnZona.latitude));
    expect((creada.datos as Map)['lon'], isNot(origenEnZona.longitude));
  });

  testWidgets('sin ubicación avisa y deja crear con el centro inicial', (
    tester,
  ) async {
    final servidor = ServidorAvisos();
    await abrirZona(tester, servidor, ubicacion: UbicacionFalsa());

    expect(find.text('No se pudo leer la ubicación.'), findsNothing);
    await tocar(tester, find.text('Usar mi ubicación'));
    expect(find.text('No se pudo leer la ubicación.'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField), 'Casa');
    await tocar(tester, find.text('Crear zona'));

    final creada = servidor.servidor.pedidos.singleWhere(
      (pedido) => pedido.metodo == 'POST' && pedido.ruta == '/zonas-habituales',
    );
    expect((creada.datos as Map)['lat'], centroInicial.latitude);
    expect((creada.datos as Map)['lon'], centroInicial.longitude);
  });

  testWidgets('editar precarga la zona, conserva si estaba activa y guarda '
      'los cambios', (tester) async {
    final servidor = ServidorAvisos();
    const zona = ZonaHabitual(
      id: 4,
      nombre: 'Trabajo',
      lat: -38.95,
      lon: -68.06,
      radioMetros: 800,
      activa: false,
    );
    await abrirZona(tester, servidor, zona: zona);

    expect(find.widgetWithText(AppBar, 'Editar zona'), findsOneWidget);
    expect(find.text('800 m'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField), 'Trabajo nuevo');
    await tocar(tester, find.text('Guardar cambios'));

    final guardada = servidor.servidor.pedidos.singleWhere(
      (pedido) =>
          pedido.metodo == 'PUT' && pedido.ruta == '/zonas-habituales/4',
    );
    expect(guardada.datos, {
      'nombre': 'Trabajo nuevo',
      'lat': zona.lat,
      'lon': zona.lon,
      'radioMetros': 800,
      'activa': false,
    });
    expect(find.byType(PantallaZonaHabitual), findsNothing);
  });

  testWidgets('si el servidor rechaza la zona, avisa y deja reintentar', (
    tester,
  ) async {
    final servidor = ServidorAvisos()
      ..errorGuardarZona = (_) => errorApi(
        400,
        'DATOS_INVALIDOS',
        'El radio tiene que ser mayor que 0',
      );
    await abrirZona(tester, servidor);

    await tester.enterText(find.byType(TextFormField), 'Casa');
    await tocar(tester, find.text('Crear zona'));

    expect(find.text('El radio tiene que ser mayor que 0'), findsOneWidget);
    expect(find.byType(PantallaZonaHabitual), findsOneWidget);

    servidor.errorGuardarZona = null;
    await tocar(tester, find.text('Crear zona'));

    expect(find.byType(PantallaZonaHabitual), findsNothing);
    expect(servidor.zonas, hasLength(1));
  });

  testWidgets('usa el centro y el radio de la zona que se edita', (
    tester,
  ) async {
    final servidor = ServidorAvisos();
    const zona = ZonaHabitual(
      id: 4,
      nombre: 'Casa',
      lat: -38.9516,
      lon: -68.0591,
      radioMetros: 1500,
      activa: true,
    );
    await abrirZona(tester, servidor, zona: zona);

    await tocar(tester, find.text('Guardar cambios'));

    final guardada = servidor.servidor.pedidos.singleWhere(
      (pedido) =>
          pedido.metodo == 'PUT' && pedido.ruta == '/zonas-habituales/4',
    );
    expect(guardada.datos, {
      'nombre': 'Casa',
      'lat': zona.lat,
      'lon': zona.lon,
      'radioMetros': 1500,
      'activa': true,
    });
  });
}
