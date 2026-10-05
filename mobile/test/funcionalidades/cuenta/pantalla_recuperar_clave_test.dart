import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/errores/mensaje_error.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Future<void> pedirEnlace(WidgetTester tester, ServidorFalso servidor) async {
    await abrirApp(tester, servidor);
    await tester.tap(find.text('Olvidé mi clave'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Correo'),
      'ana@ejemplo.com',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar enlace'));
    await tester.pumpAndSettle();
  }

  testWidgets('pide el enlace y explica qué sigue', (tester) async {
    final servidor = ServidorFalso((_) => json(204, ''));

    await pedirEnlace(tester, servidor);

    expect(servidor.pedidos.single.ruta, '/auth/recuperar-clave');
    expect(servidor.pedidos.single.datos, {'email': 'ana@ejemplo.com'});
    expect(
      find.textContaining('Si hay una cuenta con ana@ejemplo.com'),
      findsOneWidget,
    );

    await tester.tap(find.text('Volver al ingreso'));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaIngreso), findsOneWidget);
  });

  testWidgets('sin conexión avisa y deja volver a intentar', (tester) async {
    final servidor = ServidorFalso(sinConexion);

    await pedirEnlace(tester, servidor);

    expect(find.byType(MensajeError), findsOneWidget);
    expect(find.text('Enviar enlace'), findsOneWidget);
  });
}
