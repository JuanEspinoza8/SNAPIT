import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/sesion/sesion.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/avisos.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(guardarSesion);

  Future<ProviderContainer> abrirCuenta(
    WidgetTester tester,
    ServidorAvisos servidor,
  ) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final contenedor = await abrirApp(tester, servidor.servidor);
    await tester.tap(find.byTooltip('Cuenta'));
    await tester.pumpAndSettle();
    return contenedor;
  }

  Future<ProviderContainer> abrirPerfil(
    WidgetTester tester,
    ServidorAvisos servidor,
  ) async {
    final contenedor = await abrirCuenta(tester, servidor);
    await tester.tap(find.text('Perfil de movilidad'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    return contenedor;
  }

  Future<void> tocar(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('muestra los perfiles y marca el que tiene elegido', (
    tester,
  ) async {
    await abrirPerfil(tester, ServidorAvisos(perfilMovilidadId: 2));

    expect(find.text('Sin perfil'), findsOneWidget);
    expect(find.text('Silla de ruedas'), findsOneWidget);
    expect(find.text('Bastón o andador'), findsOneWidget);
    expect(
      tester
          .widget<ListTile>(find.widgetWithText(ListTile, 'Sin perfil'))
          .selected,
      isFalse,
    );
    expect(
      tester
          .widget<ListTile>(find.widgetWithText(ListTile, 'Silla de ruedas'))
          .selected,
      isFalse,
    );
    expect(
      tester
          .widget<ListTile>(find.widgetWithText(ListTile, 'Bastón o andador'))
          .selected,
      isTrue,
    );
  });

  testWidgets('elegir un perfil lo guarda y actualiza la sesión', (
    tester,
  ) async {
    final servidor = ServidorAvisos();
    final contenedor = await abrirPerfil(tester, servidor);

    await tocar(tester, find.text('Silla de ruedas'));

    expect(servidor.cambiosDeUsuario.single.datos, {'perfilMovilidadId': 1});
    expect(servidor.perfilMovilidadId, 1);
    expect(contenedor.read(sesionProvider).value?.perfilMovilidadId, 1);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('elegir Sin perfil manda null', (tester) async {
    final servidor = ServidorAvisos(perfilMovilidadId: 2);
    final contenedor = await abrirPerfil(tester, servidor);

    await tocar(tester, find.text('Sin perfil'));

    expect(servidor.cambiosDeUsuario.single.datos, {'perfilMovilidadId': null});
    expect(servidor.perfilMovilidadId, isNull);
    expect(contenedor.read(sesionProvider).value?.perfilMovilidadId, isNull);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('elegir el que ya está no hace ningún pedido', (tester) async {
    final servidor = ServidorAvisos(perfilMovilidadId: 1);
    await abrirPerfil(tester, servidor);

    await tocar(tester, find.text('Silla de ruedas'));

    expect(servidor.cambiosDeUsuario, isEmpty);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('si falla el guardado, avisa, sigue abierto y deja reintentar', (
    tester,
  ) async {
    final servidor = ServidorAvisos()
      ..errorActualizarUsuario = (_) =>
          errorApi(500, 'ERROR_INTERNO', 'No se pudo guardar el perfil');
    final contenedor = await abrirPerfil(tester, servidor);

    await tocar(tester, find.text('Silla de ruedas'));

    expect(find.text('No se pudo guardar el perfil'), findsOneWidget);
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(contenedor.read(sesionProvider).value?.perfilMovilidadId, isNull);

    servidor.errorActualizarUsuario = null;
    await tocar(tester, find.text('Silla de ruedas'));

    expect(find.byType(AlertDialog), findsNothing);
    expect(servidor.perfilMovilidadId, 1);
  });

  testWidgets('si no cargan los perfiles, deja reintentar', (tester) async {
    final servidor = ServidorAvisos()
      ..errorPerfiles = (_) =>
          errorApi(503, 'SERVICIO_NO_DISPONIBLE', 'Sin servicio');
    await abrirPerfil(tester, servidor);

    expect(
      find.textContaining('No se pudieron cargar los perfiles'),
      findsOneWidget,
    );

    servidor.errorPerfiles = null;
    await tocar(tester, find.text('Reintentar'));

    expect(find.text('Silla de ruedas'), findsOneWidget);
  });

  testWidgets('el operador no ve la opción de perfil de movilidad', (
    tester,
  ) async {
    await abrirCuenta(tester, ServidorAvisos(rol: 'OPERADOR'));

    expect(find.text('Avisos y zonas'), findsNothing);
    expect(find.text('Perfil de movilidad'), findsNothing);
    expect(find.text('Salir'), findsOneWidget);
  });
}
