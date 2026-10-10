import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';
import 'package:snapit/funcionalidades/mapa/mapa_incidentes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(guardarSesion);

  ServidorFalso servidorCon({String rol = 'VECINO'}) => ServidorFalso(
    (pedido) => switch (pedido.path) {
      '/auth/salir' => json(204, ''),
      '/incidentes' => json(200, {'incidentes': <Object>[]}),
      _ => json(200, {'usuario': usuarioJson(rol: rol)}),
    },
  );

  const avisoPanelWeb =
      'Desde la app podés ver el mapa. La gestión de incidentes se hace en el '
      'panel web.';

  testWidgets('el vecino tiene mapa, reportar y mis reportes', (tester) async {
    await abrirApp(tester, servidorCon());

    expect(find.byType(NavigationDestination), findsNWidgets(3));
    expect(find.text(avisoPanelWeb), findsNothing);
    expect(find.widgetWithText(AppBar, 'Mapa de incidentes'), findsOneWidget);
    expect(find.byType(MapaIncidentes), findsOneWidget);

    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Reportar un problema'), findsOneWidget);

    await tester.tap(find.text('Mis reportes'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Mis reportes'), findsOneWidget);
  });

  testWidgets('el mapa no se vuelve a armar al cambiar de pestaña', (
    tester,
  ) async {
    final servidor = servidorCon();
    await abrirApp(tester, servidor);
    final pedidos = servidor.cantidad('/incidentes');

    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();

    expect(pedidos, 1);
    expect(servidor.cantidad('/incidentes'), pedidos);
  });

  for (final rol in ['OPERADOR', 'ADMINISTRADOR']) {
    testWidgets('$rol ve el mapa y el aviso del panel web', (tester) async {
      await abrirApp(tester, servidorCon(rol: rol));

      expect(find.text(avisoPanelWeb), findsOneWidget);
      expect(find.widgetWithText(AppBar, 'Mapa de incidentes'), findsOneWidget);
      expect(find.byType(MapaIncidentes), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.text('Reportar'), findsNothing);
    });
  }

  testWidgets('Salir cierra la sesión y vuelve al ingreso', (tester) async {
    final servidor = servidorCon();
    await abrirApp(tester, servidor);

    await tester.tap(find.byTooltip('Cuenta'));
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
