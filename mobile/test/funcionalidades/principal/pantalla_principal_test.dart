import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(guardarSesion);

  ServidorFalso servidorCon({String rol = 'VECINO'}) => ServidorFalso(
    (pedido) => pedido.path == '/auth/salir'
        ? json(204, '')
        : json(200, {'usuario': usuarioJson(rol: rol)}),
  );

  const avisoPanelWeb =
      'Desde la app podés ver el mapa. La gestión de incidentes se hace en el '
      'panel web.';

  testWidgets('el vecino tiene mapa, reportar y mis reportes', (tester) async {
    await abrirApp(tester, servidorCon());

    expect(find.byType(NavigationDestination), findsNWidgets(3));
    expect(find.text(avisoPanelWeb), findsNothing);

    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Reportar un problema'), findsOneWidget);

    await tester.tap(find.text('Mis reportes'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Mis reportes'), findsOneWidget);
  });

  for (final rol in ['OPERADOR', 'ADMINISTRADOR']) {
    testWidgets('$rol ve el mapa y el aviso del panel web', (tester) async {
      await abrirApp(tester, servidorCon(rol: rol));

      expect(find.text(avisoPanelWeb), findsOneWidget);
      expect(find.widgetWithText(AppBar, 'Mapa de incidentes'), findsOneWidget);
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
