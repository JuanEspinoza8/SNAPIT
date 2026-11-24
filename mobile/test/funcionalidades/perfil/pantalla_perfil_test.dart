import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/perfil/pantalla_perfil.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(guardarSesion);

  final usuario = {
    ...usuarioJson(),
    'nombre': 'Ana Vecina',
    'creadoEn': '2026-02-10T15:00:00.000Z',
  };

  ServidorFalso servidor() => ServidorFalso(
    (pedido) => switch ((pedido.method, pedido.path)) {
      (_, '/incidentes') => json(200, {'incidentes': <Object>[]}),
      (_, '/social/feed') => json(200, {
        'reportes': <Object>[],
        'siguiente': null,
      }),
      (_, '/reportes/mios') => json(200, {'reportes': <Object>[]}),
      ('PATCH', '/usuarios/yo') => json(200, {
        'usuario': {...usuario, 'nombre': (pedido.data as Map)['nombre']},
      }),
      ('POST', '/auth/cambiar-clave') =>
        (pedido.data as Map)['claveActual'] == 'la-de-ahora'
            ? json(200, {
                'tokenAcceso': 'acceso-nuevo',
                'tokenRenovacion': 'renovacion-nueva',
                'usuario': usuario,
              })
            : json(400, {
                'error': {
                  'codigo': 'DATOS_INVALIDOS',
                  'mensaje': 'Hay datos inválidos',
                  'detalles': [
                    {
                      'campo': 'claveActual',
                      'mensaje': 'No es tu contraseña actual',
                    },
                  ],
                },
              }),
      _ => json(200, {'usuario': usuario}),
    },
  );

  Future<ServidorFalso> abrirPerfil(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final falso = servidor();
    await abrirApp(tester, falso);
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();
    return falso;
  }

  testWidgets('la cuenta abre el perfil: datos, desde cuándo y sus reportes', (
    tester,
  ) async {
    await abrirPerfil(tester);

    expect(find.byType(ContenidoPerfil), findsOneWidget);
    expect(find.text('Ana Vecina'), findsOneWidget);
    expect(find.text('AV'), findsOneWidget);
    expect(find.text('ana@ejemplo.com'), findsOneWidget);
    expect(find.text('Miembro desde febrero 2026'), findsOneWidget);
    expect(find.text('EDITAR PERFIL'), findsOneWidget);
    expect(find.text('Todavía no hiciste reportes'), findsOneWidget);
  });

  testWidgets('cambia el nombre y se ve al volver al perfil', (tester) async {
    final falso = await abrirPerfil(tester);
    await tester.tap(find.text('EDITAR PERFIL'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Nombre visible'),
      'Ana Pérez',
    );
    await tester.tap(find.text('Guardar nombre'));
    await tester.pumpAndSettle();

    expect(find.text('Listo, se guardó.'), findsOneWidget);
    expect(falso.pedidos.last.datos, {'nombre': 'Ana Pérez'});
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Ana Pérez'), findsOneWidget);
  });

  testWidgets('cambia la contraseña y guarda los tokens nuevos', (
    tester,
  ) async {
    await abrirPerfil(tester);
    await tester.tap(find.text('EDITAR PERFIL'));
    await tester.pumpAndSettle();

    final campos = find.byType(TextFormField);
    await tester.enterText(campos.at(1), 'la-de-ahora');
    await tester.enterText(campos.at(2), 'la-nueva-123');
    await tester.enterText(campos.at(3), 'la-nueva-123');
    await tester.ensureVisible(find.text('Cambiar contraseña'));
    await tester.tap(find.text('Cambiar contraseña'));
    await tester.pumpAndSettle();

    expect(
      find.text('Listo. Se cerró la sesión en los otros dispositivos.'),
      findsOneWidget,
    );
    final tokens = await tokensGuardados();
    expect(tokens.values, containsAll(['acceso-nuevo', 'renovacion-nueva']));
  });

  testWidgets('si la actual no es correcta, lo dice en ese campo', (
    tester,
  ) async {
    await abrirPerfil(tester);
    await tester.tap(find.text('EDITAR PERFIL'));
    await tester.pumpAndSettle();

    final campos = find.byType(TextFormField);
    await tester.enterText(campos.at(1), 'no-es-esta');
    await tester.enterText(campos.at(2), 'la-nueva-123');
    await tester.enterText(campos.at(3), 'la-nueva-123');
    await tester.ensureVisible(find.text('Cambiar contraseña'));
    await tester.tap(find.text('Cambiar contraseña'));
    await tester.pumpAndSettle();

    expect(find.text('No es tu contraseña actual'), findsOneWidget);
  });

  testWidgets('si la repetida no coincide, no manda nada', (tester) async {
    final falso = await abrirPerfil(tester);
    await tester.tap(find.text('EDITAR PERFIL'));
    await tester.pumpAndSettle();

    final campos = find.byType(TextFormField);
    await tester.enterText(campos.at(1), 'la-de-ahora');
    await tester.enterText(campos.at(2), 'la-nueva-123');
    await tester.enterText(campos.at(3), 'otra-cosa-123');
    await tester.ensureVisible(find.text('Cambiar contraseña'));
    await tester.tap(find.text('Cambiar contraseña'));
    await tester.pumpAndSettle();

    expect(find.text('No coincide con la nueva'), findsOneWidget);
    expect(falso.cantidad('/auth/cambiar-clave'), 0);
  });
}
