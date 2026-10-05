import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';
import 'package:snapit/funcionalidades/principal/pantalla_principal.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('con una sesión guardada entra directo, sin pedir la clave', (
    tester,
  ) async {
    guardarSesion();
    final servidor = ServidorFalso(
      (_) => json(200, {'usuario': usuarioJson()}),
    );

    await abrirApp(tester, servidor);

    expect(find.byType(PantallaPrincipal), findsOneWidget);
    expect(find.byType(PantallaIngreso), findsNothing);
    expect(servidor.pedidos.map((p) => p.ruta), ['/auth/yo']);
  });

  testWidgets('con el acceso vencido renueva y entra directo', (tester) async {
    guardarSesion();
    final servidor = ServidorFalso((pedido) {
      if (pedido.path == '/auth/renovar') return ingresoCorrecto();
      if (pedido.headers['Authorization'] == 'Bearer acceso-2') {
        return json(200, {'usuario': usuarioJson()});
      }
      return errorApi(401, 'TOKEN_VENCIDO', 'La sesión venció');
    });

    await abrirApp(tester, servidor);

    expect(find.byType(PantallaPrincipal), findsOneWidget);
    expect(servidor.cantidad('/auth/renovar'), 1);
  });

  testWidgets('si la renovación se rechaza, va al ingreso', (tester) async {
    guardarSesion();
    final servidor = ServidorFalso((pedido) {
      if (pedido.path == '/auth/renovar') {
        return errorApi(401, 'TOKEN_RENOVACION_INVALIDO', 'La sesión venció');
      }
      return errorApi(401, 'TOKEN_VENCIDO', 'La sesión venció');
    });

    await abrirApp(tester, servidor);

    expect(find.byType(PantallaIngreso), findsOneWidget);
    expect(await tokensGuardados(), isEmpty);
  });

  testWidgets('sin conexión avisa, conserva la sesión y deja reintentar', (
    tester,
  ) async {
    guardarSesion();
    final servidor = ServidorFalso(sinConexion);

    await abrirApp(tester, servidor);

    expect(
      find.text(
        'No se pudo conectar con el servidor. Revisá tu conexión e intentá '
        'de nuevo.',
      ),
      findsOneWidget,
    );
    expect(find.byType(PantallaIngreso), findsNothing);

    servidor.responder = (_) => json(200, {'usuario': usuarioJson()});
    await tester.tap(find.widgetWithText(FilledButton, 'Reintentar'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaPrincipal), findsOneWidget);
  });
}
