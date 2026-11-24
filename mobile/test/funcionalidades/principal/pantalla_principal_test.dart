import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/funcionalidades/perfil/pantalla_editar_perfil.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';
import 'package:snapit/funcionalidades/feed/pantalla_feed.dart';
import 'package:snapit/funcionalidades/mapa/foco_mapa.dart';
import 'package:snapit/funcionalidades/mapa/mapa_incidentes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';
import '../mapa/mapa_incidentes_test.dart' show incidenteJson;

void main() {
  setUp(guardarSesion);

  ServidorFalso servidorCon({String rol = 'VECINO'}) => ServidorFalso(
    (pedido) => switch (pedido.path) {
      '/auth/salir' => json(204, ''),
      '/incidentes' => json(200, {'incidentes': <Object>[]}),
      '/social/feed' => json(200, {'reportes': <Object>[], 'siguiente': null}),
      '/reportes/mios' => json(200, {'reportes': <Object>[]}),
      _ => json(200, {'usuario': usuarioJson(rol: rol)}),
    },
  );

  const avisoPanelWeb =
      'Desde la app podés ver el mapa. La gestión de incidentes se hace en el '
      'panel web.';

  testWidgets('el vecino arranca en el inicio y tiene mapa, reportar, mis '
      'reportes y recorrido', (tester) async {
    await abrirApp(tester, servidorCon());

    expect(find.byType(NavigationDestination), findsNWidgets(5));
    expect(find.byType(PantallaFeed), findsOneWidget);
    expect(find.text('Todavía no hay publicaciones'), findsOneWidget);

    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();
    expect(find.text(avisoPanelWeb), findsNothing);
    expect(find.widgetWithText(AppBar, 'Mapa de incidentes'), findsOneWidget);
    expect(find.byType(MapaIncidentes), findsOneWidget);

    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Reportar un problema'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Mi perfil'), findsOneWidget);
    expect(find.text('Todavía no hiciste reportes'), findsOneWidget);

    await tester.tap(find.text('Recorrido'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Recorrido accesible'), findsOneWidget);
  });

  testWidgets('la barra queda fija sobre una pantalla abierta encima, y una '
      'sección vuelve a la principal', (tester) async {
    final contenedor = await abrirApp(tester, servidorCon());

    contenedor.read(rutasProvider).push(Rutas.editarPerfil);
    await tester.pumpAndSettle();
    expect(find.byType(PantallaEditarPerfil), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);

    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaEditarPerfil), findsNothing);
    expect(find.widgetWithText(AppBar, 'Mapa de incidentes'), findsOneWidget);
  });

  testWidgets('el mapa no pide la ubicación hasta que se abre', (tester) async {
    final ubicacion = UbicacionFalsa();
    await abrirApp(tester, servidorCon(), ubicacion: ubicacion);

    expect(find.byType(MapaIncidentes), findsNothing);
    expect(ubicacion.pedidos, 0);

    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();
    expect(find.byType(MapaIncidentes), findsOneWidget);
    expect(ubicacion.pedidos, 1);
  });

  testWidgets('si otra pantalla pidió un punto antes de abrir el mapa, el mapa '
      'arranca ahí y no en la ubicación', (tester) async {
    const punto = LatLng(-38.9516, -68.0591);
    final servidor = ServidorFalso(
      (pedido) => switch (pedido.path) {
        '/incidentes' => json(200, {
          'incidentes': [incidenteJson(9)],
        }),
        '/social/feed' => json(200, {
          'reportes': <Object>[],
          'siguiente': null,
        }),
        _ => json(200, {'usuario': usuarioJson()}),
      },
    );
    // El teléfono está a unos 10 km: centrado ahí, el incidente no se vería.
    final contenedor = await abrirApp(
      tester,
      servidor,
      ubicacion: UbicacionFalsa(const LatLng(-38.86, -68.06)),
    );

    contenedor.read(focoMapaProvider.notifier).enfocar(punto);
    await tester.tap(find.text('Mapa'));
    // El mapa pide los puntos cuando se queda quieto (300 ms).
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Cordón sin rampa, En revisión'), findsOne);
    expect(contenedor.read(focoMapaProvider), isNull);
  });

  testWidgets('el mapa no se vuelve a armar al cambiar de pestaña', (
    tester,
  ) async {
    final servidor = servidorCon();
    await abrirApp(tester, servidor);
    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();
    final pedidos = servidor.cantidad('/incidentes');

    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();

    expect(pedidos, 1);
    expect(servidor.cantidad('/incidentes'), pedidos);
  });

  for (final rol in ['OPERADOR', 'ADMINISTRADOR']) {
    testWidgets('$rol ve el inicio, el mapa, su perfil y el aviso del panel '
        'web', (tester) async {
      await abrirApp(tester, servidorCon(rol: rol));

      expect(find.byType(NavigationDestination), findsNWidgets(3));
      expect(find.text('Mi perfil'), findsOneWidget);
      expect(find.byType(PantallaFeed), findsOneWidget);
      expect(find.text('Reportar'), findsNothing);

      await tester.tap(find.text('Mapa'));
      await tester.pumpAndSettle();
      expect(find.text(avisoPanelWeb), findsOneWidget);
      expect(find.widgetWithText(AppBar, 'Mapa de incidentes'), findsOneWidget);
      expect(find.byType(MapaIncidentes), findsOneWidget);
    });
  }

  testWidgets('arranca en el tema oscuro y desde la cuenta se cambia al claro, '
      'que queda guardado', (tester) async {
    await abrirApp(tester, servidorCon());
    Brightness brillo() =>
        // El feed queda debajo del perfil al abrir la cuenta: igual se lee.
        Theme.of(
          tester.element(find.byType(PantallaFeed, skipOffstage: false)),
        ).brightness;
    expect(brillo(), Brightness.dark);

    // Los ajustes de la cuenta están en «Mi perfil», en la rueda de arriba.
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ajustes de la cuenta'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tema oscuro'));
    await tester.pumpAndSettle();

    expect(brillo(), Brightness.light);
    expect((await tokensGuardados())['modoTema'], 'claro');
  });

  testWidgets('recuerda el tema claro de la vez anterior', (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      ...sesionGuardada,
      'modoTema': 'claro',
    });
    await abrirApp(tester, servidorCon());

    expect(
      Theme.of(tester.element(find.byType(PantallaFeed))).brightness,
      Brightness.light,
    );
  });

  testWidgets('Salir cierra la sesión y vuelve al ingreso', (tester) async {
    final servidor = servidorCon();
    await abrirApp(tester, servidor);

    // Los ajustes de la cuenta están en «Mi perfil», en la rueda de arriba.
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ajustes de la cuenta'));
    await tester.pumpAndSettle();
    expect(find.text('Ana'), findsOneWidget);
    expect(find.text('ana@ejemplo.com'), findsOneWidget);
    expect(find.text('Vecino'), findsOneWidget);

    await tester.tap(find.text('Salir'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaIngreso), findsOneWidget);
    expect(await tokensGuardados(), isEmpty);
    expect(servidor.pedidos.last.ruta, '/auth/salir');
  });

  testWidgets('si la sesión se rechaza mientras se usa, vuelve al ingreso', (
    tester,
  ) async {
    final servidor = servidorCon();
    final contenedor = await abrirApp(tester, servidor);

    servidor.responder = (pedido) {
      if (pedido.path == '/auth/renovar') {
        return errorApi(401, 'TOKEN_RENOVACION_INVALIDO', 'La sesión venció');
      }
      return errorApi(401, 'TOKEN_VENCIDO', 'La sesión venció');
    };
    // Cualquier pantalla que pida algo con la sesión vencida.
    final pedido = expectLater(
      contenedor.read(clienteApiProvider).get<Object>('/reportes/mios'),
      throwsA(isA<DioException>()),
    );
    await tester.pumpAndSettle();
    await pedido;

    expect(find.byType(PantallaIngreso), findsOneWidget);
  });
}
