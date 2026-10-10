import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_recuperar_clave.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_registro.dart';
import 'package:snapit/funcionalidades/principal/pantalla_principal.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Future<void> ingresar(
    WidgetTester tester, {
    String correo = 'ana@ejemplo.com',
    String clave = 'una-clave-segura',
  }) async {
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Correo'),
      correo,
    );
    await tester.enterText(find.widgetWithText(TextFormField, 'Clave'), clave);
    await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
    await tester.pumpAndSettle();
  }

  testWidgets('sin sesión guardada abre en el ingreso', (tester) async {
    final servidor = ServidorFalso((_) => json(200, {}));

    await abrirApp(tester, servidor);

    expect(find.byType(PantallaIngreso), findsOneWidget);
    expect(servidor.pedidos, isEmpty);
  });

  testWidgets('con datos correctos entra y guarda la sesión', (tester) async {
    final servidor = ServidorFalso((_) => ingresoCorrecto());
    await abrirApp(tester, servidor);

    await ingresar(tester, correo: '  ana@ejemplo.com ');

    expect(find.byType(PantallaPrincipal), findsOneWidget);
    expect(servidor.pedidos.first.ruta, '/auth/ingreso');
    expect(servidor.pedidos.first.datos, {
      'email': 'ana@ejemplo.com',
      'clave': 'una-clave-segura',
    });
    expect(await tokensGuardados(), {
      'tokenAcceso': 'acceso-2',
      'tokenRenovacion': 'renovacion-2',
    });
  });

  testWidgets('con datos incorrectos muestra el mensaje y no entra', (
    tester,
  ) async {
    final servidor = ServidorFalso(
      (_) => errorApi(
        401,
        'CREDENCIALES_INVALIDAS',
        'El correo o la clave no son correctos',
      ),
    );
    await abrirApp(tester, servidor);

    await ingresar(tester, clave: 'otra-clave');

    expect(find.text('El correo o la clave no son correctos'), findsOneWidget);
    expect(find.byType(PantallaIngreso), findsOneWidget);
    expect(servidor.cantidad('/auth/renovar'), 0);
  });

  testWidgets('con la cuenta sin confirmar explica qué falta', (tester) async {
    const mensaje =
        'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada y '
        'seguí el enlace que te enviamos';
    final servidor = ServidorFalso(
      (_) => errorApi(403, 'CUENTA_SIN_CONFIRMAR', mensaje),
    );
    await abrirApp(tester, servidor);

    await ingresar(tester);

    expect(find.text(mensaje), findsOneWidget);
    expect(find.byType(PantallaIngreso), findsOneWidget);
  });

  testWidgets('sin conexión avisa que no se pudo conectar', (tester) async {
    final servidor = ServidorFalso(sinConexion);
    await abrirApp(tester, servidor);

    await ingresar(tester);

    expect(
      find.text(
        'No se pudo conectar con el servidor. Revisá tu conexión e intentá '
        'de nuevo.',
      ),
      findsOneWidget,
    );
    expect(
      find.widgetWithText(TextFormField, 'ana@ejemplo.com'),
      findsOneWidget,
    );
  });

  testWidgets('con campos vacíos marca los errores y no consulta', (
    tester,
  ) async {
    final servidor = ServidorFalso((_) => ingresoCorrecto());
    await abrirApp(tester, servidor);

    await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
    await tester.pumpAndSettle();

    expect(find.text('Es obligatorio'), findsOneWidget);
    expect(find.text('Es obligatoria'), findsOneWidget);
    expect(servidor.pedidos, isEmpty);
  });

  testWidgets('lleva a crear una cuenta y a recuperar la clave', (
    tester,
  ) async {
    await abrirApp(tester, ServidorFalso((_) => json(200, {})));

    await tester.tap(find.text('Crear una cuenta'));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaRegistro), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Olvidé mi clave'));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaRecuperarClave), findsOneWidget);
  });
}
