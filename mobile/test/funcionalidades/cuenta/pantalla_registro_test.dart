import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/errores/mensaje_error.dart';
import 'package:snapit/funcionalidades/cuenta/pantalla_ingreso.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Finder campo(String etiqueta) => find.widgetWithText(TextFormField, etiqueta);

  Future<void> abrirRegistro(
    WidgetTester tester,
    ServidorFalso servidor,
  ) async {
    await abrirApp(tester, servidor);
    await tester.tap(find.text('Crear una cuenta'));
    await tester.pumpAndSettle();
  }

  Future<void> registrar(
    WidgetTester tester, {
    String nombre = ' Ana ',
    String correo = 'ana@ejemplo.com',
    String clave = 'una-clave-segura',
  }) async {
    await tester.enterText(campo('Nombre'), nombre);
    await tester.enterText(campo('Correo'), correo);
    await tester.enterText(campo('Clave'), clave);
    await tester.tap(find.widgetWithText(FilledButton, 'Crear cuenta'));
    await tester.pumpAndSettle();
  }

  testWidgets('crea la cuenta y explica cómo confirmarla', (tester) async {
    final servidor = ServidorFalso(
      (_) => json(201, {'usuario': usuarioJson()}),
    );
    await abrirRegistro(tester, servidor);

    await registrar(tester);

    final pedido = servidor.pedidos.single;
    expect(pedido.ruta, '/auth/registro');
    expect(pedido.datos, {
      'nombre': 'Ana',
      'email': 'ana@ejemplo.com',
      'clave': 'una-clave-segura',
    });
    expect(find.text('Revisá tu correo'), findsOneWidget);
    expect(find.textContaining('ana@ejemplo.com'), findsOneWidget);

    await tester.tap(find.text('Ir al ingreso'));
    await tester.pumpAndSettle();
    expect(find.byType(PantallaIngreso), findsOneWidget);
  });

  testWidgets('valida en el teléfono antes de enviar', (tester) async {
    final servidor = ServidorFalso((_) => json(201, {}));
    await abrirRegistro(tester, servidor);

    await registrar(tester, nombre: '  ', correo: 'ana', clave: '1234567');

    expect(find.text('Es obligatorio'), findsOneWidget);
    expect(find.text('No es un correo válido'), findsOneWidget);
    expect(find.text('Tiene que tener al menos 8 caracteres'), findsOneWidget);
    expect(servidor.pedidos, isEmpty);
  });

  testWidgets('un correo ya registrado se marca en su campo hasta corregirlo', (
    tester,
  ) async {
    final servidor = ServidorFalso(
      (_) => errorApi(409, 'EMAIL_EN_USO', 'Ya hay una cuenta con ese correo'),
    );
    await abrirRegistro(tester, servidor);

    await registrar(tester);

    expect(find.text('Ya hay una cuenta con ese correo'), findsOneWidget);
    expect(find.byType(MensajeError), findsNothing);

    // Sin corregirlo no se vuelve a enviar.
    await tester.tap(find.widgetWithText(FilledButton, 'Crear cuenta'));
    await tester.pumpAndSettle();
    expect(servidor.pedidos, hasLength(1));

    await tester.enterText(campo('ana@ejemplo.com'), 'ana2@ejemplo.com');
    await tester.pump();
    expect(find.text('Ya hay una cuenta con ese correo'), findsNothing);
  });

  testWidgets('los errores del servidor van debajo de cada campo', (
    tester,
  ) async {
    final servidor = ServidorFalso(
      (_) => json(400, {
        'error': {
          'codigo': 'DATOS_INVALIDOS',
          'mensaje': 'Hay datos inválidos',
          'detalles': [
            {'campo': 'email', 'mensaje': 'No es un correo válido'},
          ],
        },
      }),
    );
    await abrirRegistro(tester, servidor);

    await registrar(tester, correo: 'ana@ejemplo.c');

    expect(
      find.descendant(
        of: campo('ana@ejemplo.c'),
        matching: find.text('No es un correo válido'),
      ),
      findsOneWidget,
    );
    expect(find.byType(MensajeError), findsNothing);
  });

  testWidgets('sin conexión avisa y conserva lo escrito', (tester) async {
    await abrirRegistro(tester, ServidorFalso(sinConexion));

    await registrar(tester);

    expect(
      find.widgetWithText(
        MensajeError,
        'No se pudo conectar con el servidor. Revisá tu conexión e intentá '
        'de nuevo.',
      ),
      findsOneWidget,
    );
    expect(campo('ana@ejemplo.com'), findsOneWidget);
  });
}
