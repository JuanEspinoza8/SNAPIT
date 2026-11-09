import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/funcionalidades/avisos/pantalla_ajustes_avisos.dart';
import 'package:snapit/funcionalidades/avisos/servicio_push.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/avisos.dart';
import '../../apoyo/push_falso.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(guardarSesion);

  // Un celular de 360 × 780.
  Future<void> abrirAjustes(
    WidgetTester tester,
    ServidorAvisos servidor, {
    ServicioPushFalso? servicioPush,
  }) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final contenedor = await abrirApp(
      tester,
      servidor.servidor,
      servicioPush: servicioPush,
    );
    contenedor.read(rutasProvider).push(Rutas.ajustesAvisos);
    await tester.pumpAndSettle();
    expect(find.byType(PantallaAjustesAvisos), findsOneWidget);
  }

  Future<void> tocar(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('muestra el interruptor general, las categorías y las zonas', (
    tester,
  ) async {
    final servidor = ServidorAvisos(zonas: [zonaAvisosJson()]);
    await abrirAjustes(tester, servidor);

    expect(find.text('Recibir avisos'), findsOneWidget);
    expect(
      tester
          .widget<SwitchListTile>(
            find.widgetWithText(SwitchListTile, 'Recibir avisos'),
          )
          .value,
      isTrue,
    );

    expect(find.text('Vereda rota'), findsOneWidget);
    expect(find.text('Cordón sin rampa'), findsOneWidget);
    expect(
      tester
          .widget<SwitchListTile>(
            find.widgetWithText(SwitchListTile, 'Vereda rota'),
          )
          .value,
      isTrue,
    );
    expect(
      tester
          .widget<SwitchListTile>(
            find.widgetWithText(SwitchListTile, 'Cordón sin rampa'),
          )
          .value,
      isFalse,
    );

    expect(find.text('Casa'), findsOneWidget);
    expect(find.text('Radio de 300 m'), findsOneWidget);
    expect(servidor.pedidosZonas, 1);
  });

  testWidgets('el interruptor general se guarda y actualiza la sesión', (
    tester,
  ) async {
    final servidor = ServidorAvisos();
    await abrirAjustes(tester, servidor);

    await tocar(tester, find.text('Recibir avisos'));

    expect(servidor.notificacionesHabilitadas, isFalse);
    expect(servidor.cambiosDeUsuario.single.datos, {
      'notificacionesHabilitadas': false,
    });
    expect(
      tester
          .widget<SwitchListTile>(
            find.widgetWithText(SwitchListTile, 'Recibir avisos'),
          )
          .value,
      isFalse,
    );
  });

  testWidgets('si no se puede guardar el interruptor, avisa y lo deja como '
      'estaba', (tester) async {
    final servidor = ServidorAvisos()
      ..errorActualizarUsuario = (_) =>
          errorApi(500, 'ERROR_INTERNO', 'No se pudo guardar el cambio');
    await abrirAjustes(tester, servidor);

    await tocar(tester, find.text('Recibir avisos'));

    expect(find.text('No se pudo guardar el cambio'), findsOneWidget);
    expect(
      tester
          .widget<SwitchListTile>(
            find.widgetWithText(SwitchListTile, 'Recibir avisos'),
          )
          .value,
      isTrue,
    );
  });

  testWidgets('cambiar una categoría manda solo esa preferencia', (
    tester,
  ) async {
    final servidor = ServidorAvisos();
    await abrirAjustes(tester, servidor);

    await tocar(
      tester,
      find.widgetWithText(SwitchListTile, 'Cordón sin rampa'),
    );

    final guardado = servidor.servidor.pedidos.singleWhere(
      (pedido) =>
          pedido.metodo == 'PUT' && pedido.ruta == '/preferencias-notificacion',
    );
    expect(guardado.datos, {
      'preferencias': [
        {'categoriaId': 3, 'habilitada': true},
      ],
    });
    expect(
      servidor.preferencias.singleWhere(
        (preferencia) => preferencia['categoriaId'] == 3,
      )['habilitada'],
      isTrue,
    );
  });

  testWidgets('si no se puede guardar una categoría, vuelve atrás y avisa', (
    tester,
  ) async {
    final servidor = ServidorAvisos()
      ..errorGuardarPreferencias = (_) =>
          errorApi(500, 'ERROR_INTERNO', 'No se pudo guardar la categoría');
    await abrirAjustes(tester, servidor);

    await tocar(tester, find.widgetWithText(SwitchListTile, 'Vereda rota'));

    expect(find.text('No se pudo guardar la categoría'), findsOneWidget);
    expect(
      tester
          .widget<SwitchListTile>(
            find.widgetWithText(SwitchListTile, 'Vereda rota'),
          )
          .value,
      isTrue,
    );
  });

  testWidgets('si no cargan las categorías, deja reintentar', (tester) async {
    final servidor = ServidorAvisos()
      ..errorCategorias = (_) =>
          errorApi(500, 'ERROR_INTERNO', 'No se pudieron cargar los avisos');
    await abrirAjustes(tester, servidor);

    expect(find.text('No se pudieron cargar los avisos'), findsOneWidget);

    servidor.errorCategorias = null;
    await tocar(tester, find.text('Reintentar'));

    expect(find.text('Vereda rota'), findsOneWidget);
  });

  testWidgets('si no cargan las zonas, deja reintentar', (tester) async {
    final servidor = ServidorAvisos(zonas: [zonaAvisosJson()])
      ..errorZonas = (_) =>
          errorApi(500, 'ERROR_INTERNO', 'No se pudieron cargar las zonas');
    await abrirAjustes(tester, servidor);

    expect(find.text('No se pudieron cargar las zonas'), findsOneWidget);

    servidor.errorZonas = null;
    await tocar(tester, find.text('Reintentar'));

    expect(find.text('Casa'), findsOneWidget);
  });

  testWidgets('pausar una zona la guarda apagada', (tester) async {
    final servidor = ServidorAvisos(zonas: [zonaAvisosJson()]);
    await abrirAjustes(tester, servidor);

    final interruptor = find.descendant(
      of: find.widgetWithText(ListTile, 'Casa'),
      matching: find.byType(Switch),
    );
    await tocar(tester, interruptor);

    final guardado = servidor.servidor.pedidos.singleWhere(
      (pedido) =>
          pedido.metodo == 'PUT' && pedido.ruta == '/zonas-habituales/4',
    );
    expect(guardado.datos, {
      'nombre': 'Casa',
      'lat': -38.9516,
      'lon': -68.0591,
      'radioMetros': 300,
      'activa': false,
    });
    expect(servidor.zonas.single['activa'], isFalse);
  });

  testWidgets('borrar una zona pide confirmación y la quita de la lista', (
    tester,
  ) async {
    final servidor = ServidorAvisos(zonas: [zonaAvisosJson()]);
    await abrirAjustes(tester, servidor);

    await tocar(tester, find.byTooltip('Borrar Casa'));
    expect(find.text('¿Querés borrar “Casa”?'), findsOneWidget);

    await tocar(tester, find.widgetWithText(FilledButton, 'Borrar'));

    expect(servidor.zonas, isEmpty);
    expect(find.text('Todavía no agregaste ninguna zona.'), findsOneWidget);
    expect(find.text('Casa'), findsNothing);
  });

  testWidgets('cancelar el borrado deja la zona', (tester) async {
    final servidor = ServidorAvisos(zonas: [zonaAvisosJson()]);
    await abrirAjustes(tester, servidor);

    await tocar(tester, find.byTooltip('Borrar Casa'));
    await tocar(tester, find.text('Cancelar'));

    expect(servidor.zonas, hasLength(1));
    expect(find.text('Casa'), findsOneWidget);
  });

  testWidgets('el operador ve que los avisos son solo para vecinos', (
    tester,
  ) async {
    final servidor = ServidorAvisos(rol: 'OPERADOR');
    await abrirAjustes(tester, servidor);

    expect(
      find.text('Los avisos y las zonas habituales son solo para vecinos.'),
      findsOneWidget,
    );
    expect(find.byType(SwitchListTile), findsNothing);
    expect(servidor.pedidosZonas, 0);
  });

  testWidgets('el botón que confirma el borrado es de peligro', (tester) async {
    await abrirAjustes(tester, ServidorAvisos(zonas: [zonaAvisosJson()]));

    await tocar(tester, find.byTooltip('Borrar Casa'));

    final boton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Borrar'),
    );
    final contexto = tester.element(find.text('Borrar zona'));
    expect(
      boton.style?.backgroundColor?.resolve({}),
      Theme.of(contexto).colorScheme.error,
    );
  });

  group('el permiso del teléfono', () {
    testWidgets('con el permiso dado no dice nada', (tester) async {
      await abrirAjustes(tester, ServidorAvisos());

      expect(find.textContaining('el teléfono'), findsNothing);
    });

    testWidgets('después de «Ahora no» deja activarlo desde acá', (
      tester,
    ) async {
      FlutterSecureStorage.setMockInitialValues({
        ...sesionGuardada,
        'avisosPospuestos': 'si',
      });
      final push = ServicioPushFalso(permiso: EstadoPermiso.noDeterminado);
      await abrirAjustes(tester, ServidorAvisos(), servicioPush: push);

      expect(
        find.text('El teléfono todavía no muestra los avisos'),
        findsOneWidget,
      );
      await tocar(tester, find.text('Activar'));

      expect(push.permisosPedidos, 1);
      expect(
        find.text('El teléfono todavía no muestra los avisos'),
        findsNothing,
      );
    });

    testWidgets('negado, explica dónde activarlo', (tester) async {
      final push = ServicioPushFalso(permiso: EstadoPermiso.denegado);
      await abrirAjustes(tester, ServidorAvisos(), servicioPush: push);

      expect(
        find.text('Los avisos están apagados en el teléfono'),
        findsOneWidget,
      );
      expect(find.text('Activar'), findsNothing);
    });
  });
}
