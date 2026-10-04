import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/app.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/sesion/almacen_sesion.dart';

import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Widget app(ServidorFalso servidor) {
    final dio = crearClienteApi(
      urlBase: 'http://api.test/api',
      almacen: AlmacenSesion(),
    )..httpClientAdapter = servidor;
    return ProviderScope(
      retry: (_, _) => null,
      overrides: [clienteApiProvider.overrideWithValue(dio)],
      child: const AppSnapIt(),
    );
  }

  Finder enAviso(String texto) =>
      find.descendant(of: find.byType(SnackBar), matching: find.text(texto));

  testWidgets('abre la pantalla inicial con el estado del servidor', (
    tester,
  ) async {
    final servidor = ServidorFalso(
      (_) => json(200, {'estado': 'ok', 'baseDeDatos': 'ok'}),
    );

    await tester.pumpWidget(app(servidor));
    await tester.pumpAndSettle();

    expect(find.text('SnapIt'), findsOneWidget);
    expect(find.text('Servidor: conectado'), findsOneWidget);
    expect(find.text('Base de datos: conectada'), findsOneWidget);
    expect(servidor.pedidos.single.ruta, '/salud');
  });

  testWidgets('muestra en un aviso el mensaje de error del servidor', (
    tester,
  ) async {
    final servidor = ServidorFalso(
      (_) => errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error en el servidor'),
    );

    await tester.pumpWidget(app(servidor));
    await tester.pumpAndSettle();

    expect(find.text('No se pudo consultar el servidor.'), findsOneWidget);
    expect(enAviso('Ocurrió un error en el servidor'), findsOneWidget);
  });

  testWidgets('sin conexión avisa y permite reintentar', (tester) async {
    final servidor = ServidorFalso(sinConexion);

    await tester.pumpWidget(app(servidor));
    await tester.pumpAndSettle();

    expect(
      enAviso(
        'No se pudo conectar con el servidor. Revisá tu conexión e intentá '
        'de nuevo.',
      ),
      findsOneWidget,
    );

    servidor.responder = (_) =>
        json(200, {'estado': 'ok', 'baseDeDatos': 'error'});
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.text('Servidor: conectado'), findsOneWidget);
    expect(find.text('Base de datos: sin conexión'), findsOneWidget);
  });
}
