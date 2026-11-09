import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/avisos/modelos.dart';
import 'package:snapit/funcionalidades/avisos/pantalla_avisos.dart';
import 'package:snapit/funcionalidades/avisos/servicio_push.dart';
import 'package:snapit/funcionalidades/feed/pantalla_incidente.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/push_falso.dart';
import '../../apoyo/servidor_falso.dart';
import '../mapa/mapa_incidentes_test.dart' show fichaJson;

Map<String, Object?> avisoJson(
  int id, {
  bool leida = false,
  int? incidenteId = 9,
  String tipo = 'CAMBIO_ESTADO',
  String titulo = 'Tu reporte avanzó',
  String cuerpo = 'El pozo de Lago Huechulafquen pasó a En ejecución',
}) => {
  'id': id,
  'tipo': tipo,
  'incidenteId': incidenteId,
  'titulo': titulo,
  'cuerpo': cuerpo,
  'creadoEn': '2026-11-04T13:10:00.000Z',
  'enviadaEn': '2026-11-04T13:10:01.000Z',
  'leidaEn': leida ? '2026-11-04T14:00:00.000Z' : null,
};

/// Servidor con la lista de avisos y la ficha del incidente 9, que usan los
/// avisos para abrirse.
ServidorFalso servidorConAvisos([List<Map<String, Object?>>? avisos]) {
  return ServidorFalso(
    (pedido) => switch (pedido.path) {
      '/incidentes/feed' => json(200, {
        'incidentes': <Object>[],
        'siguiente': null,
      }),
      '/notificaciones' => json(200, {'notificaciones': avisos ?? <Object>[]}),
      final ruta when ruta.startsWith('/notificaciones/') => json(204, ''),
      '/dispositivos' => json(204, ''),
      '/auth/yo' => json(200, {'usuario': usuarioJson()}),
      '/auth/salir' => json(204, ''),
      '/incidentes/9' => json(200, fichaJson(9)),
      '/social/incidentes/9/reportes' => json(200, {'reportes': <Object>[]}),
      '/social/incidentes/9/comentarios' => json(200, {
        'comentarios': <Object>[],
      }),
      _ => errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe'),
    },
  );
}

Map<String, Object?>? pedido(ServidorFalso servidor, String ruta) {
  for (final actual in servidor.pedidos.reversed) {
    if (actual.ruta == ruta) {
      return Map<String, Object?>.from(actual.datos! as Map);
    }
  }
  return null;
}

void main() {
  setUp(guardarSesion);

  testWidgets('la lista muestra los avisos leídos y sin leer, y tocar uno '
      'abre la ficha del incidente', (tester) async {
    final servidor = servidorConAvisos([
      avisoJson(31),
      avisoJson(
        30,
        leida: true,
        incidenteId: null,
        tipo: 'VERIFICACION',
        titulo: 'Incidente verificado',
        cuerpo: 'Vecinos confirmaron el bache',
      ),
    ]);
    await abrirApp(tester, servidor);

    // El contador de la barra superior cuenta solo el que falta leer.
    await tester.tap(find.byTooltip('Avisos (1 sin leer)'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaAvisos), findsOneWidget);
    expect(find.text('Tu reporte avanzó'), findsOneWidget);
    expect(find.text('Incidente verificado'), findsOneWidget);

    await tester.tap(find.text('Tu reporte avanzó'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaIncidente), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'Cordón sin rampa'), findsOneWidget);
    expect(servidor.cantidad('/notificaciones/31/leida'), 1);
  });

  testWidgets('en Android 13 explica para qué son los avisos antes de pedir '
      'el permiso', (tester) async {
    final push = ServicioPushFalso(permiso: EstadoPermiso.noDeterminado);
    await abrirApp(tester, servidorConAvisos(), servicioPush: push);

    expect(find.text('Activá los avisos'), findsOneWidget);
    expect(
      find.textContaining('Podés desactivarlos cuando quieras'),
      findsOneWidget,
    );
    expect(push.permisosPedidos, 0);

    await tester.tap(find.text('Activar'));
    await tester.pumpAndSettle();

    expect(push.permisosPedidos, 1);
  });

  testWidgets('si el usuario dice «Ahora no» no se pide el permiso', (
    tester,
  ) async {
    final push = ServicioPushFalso(permiso: EstadoPermiso.noDeterminado);
    await abrirApp(tester, servidorConAvisos(), servicioPush: push);

    await tester.tap(find.text('Ahora no'));
    await tester.pumpAndSettle();

    expect(push.permisosPedidos, 0);
    expect((await tokensGuardados())['avisosPospuestos'], 'si');
  });

  testWidgets('después de «Ahora no» no vuelve a preguntar al abrir la app', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      ...sesionGuardada,
      'avisosPospuestos': 'si',
    });
    final push = ServicioPushFalso(
      permiso: EstadoPermiso.noDeterminado,
      tokenPush: 'token-1',
    );
    final servidor = servidorConAvisos();
    await abrirApp(tester, servidor, servicioPush: push);

    expect(find.text('Activá los avisos'), findsNothing);
    expect(push.permisosPedidos, 0);
    // El celular se registra igual: los avisos quedan en la lista.
    expect(servidor.cantidad('/dispositivos'), 1);
  });

  testWidgets('al operador no se le piden los avisos ni ve la campana', (
    tester,
  ) async {
    final push = ServicioPushFalso(
      permiso: EstadoPermiso.noDeterminado,
      tokenPush: 'token-1',
    );
    final servidor = servidorConAvisos();
    final responder = servidor.responder;
    servidor.responder = (pedido) => pedido.path == '/auth/yo'
        ? json(200, {'usuario': usuarioJson(rol: 'OPERADOR')})
        : responder(pedido);
    await abrirApp(tester, servidor, servicioPush: push);

    expect(find.text('Activá los avisos'), findsNothing);
    expect(find.byTooltip('Avisos'), findsNothing);
    expect(servidor.cantidad('/dispositivos'), 0);
    expect(servidor.cantidad('/notificaciones'), 0);
  });

  testWidgets('registra el token al ingresar, cuando FCM lo renueva y lo da '
      'de baja al salir', (tester) async {
    final push = ServicioPushFalso(tokenPush: 'token-1');
    final servidor = servidorConAvisos();
    await abrirApp(tester, servidor, servicioPush: push);

    expect(pedido(servidor, '/dispositivos'), {
      'tokenPush': 'token-1',
      'plataforma': 'ANDROID',
    });
    expect((await tokensGuardados())['tokenPush'], 'token-1');

    push.renovarToken('token-2');
    await tester.pumpAndSettle();

    expect(servidor.cantidad('/dispositivos'), 2);
    expect(pedido(servidor, '/dispositivos'), {
      'tokenPush': 'token-2',
      'plataforma': 'ANDROID',
    });

    await tester.tap(find.byTooltip('Cuenta'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salir'));
    await tester.pumpAndSettle();

    expect(pedido(servidor, '/auth/salir'), {
      'tokenRenovacion': 'renovacion-1',
      'tokenPush': 'token-2',
    });
    expect(await tokensGuardados(), isEmpty);
  });

  testWidgets('sin token de avisos, al salir no lo manda', (tester) async {
    final servidor = servidorConAvisos();
    await abrirApp(tester, servidor);

    await tester.tap(find.byTooltip('Cuenta'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salir'));
    await tester.pumpAndSettle();

    // Con `null` o `""` el servidor respondería 400 y no cerraría la sesión.
    expect(pedido(servidor, '/auth/salir'), {
      'tokenRenovacion': 'renovacion-1',
    });
  });

  testWidgets('un aviso con la app abierta se muestra y abre la ficha', (
    tester,
  ) async {
    final push = ServicioPushFalso();
    final servidor = servidorConAvisos();
    await abrirApp(tester, servidor, servicioPush: push);

    push.recibir(
      const MensajePush(
        notificacionId: 31,
        tipo: 'CAMBIO_ESTADO',
        incidenteId: 9,
        titulo: 'Tu reporte avanzó',
        cuerpo: 'El pozo pasó a En ejecución',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Tu reporte avanzó'), findsOneWidget);

    await tester.tap(find.text('Ver'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaIncidente), findsOneWidget);
    expect(servidor.cantidad('/notificaciones/31/leida'), 1);
  });

  testWidgets('un aviso que abrió la app desde cero abre la ficha', (
    tester,
  ) async {
    final push = ServicioPushFalso()
      ..inicial = const MensajePush(
        notificacionId: 31,
        tipo: 'CAMBIO_ESTADO',
        incidenteId: 9,
        titulo: 'Tu reporte avanzó',
        cuerpo: 'El pozo pasó a En ejecución',
      );
    final servidor = servidorConAvisos();
    await abrirApp(tester, servidor, servicioPush: push);

    expect(find.byType(PantallaIncidente), findsOneWidget);
    expect(servidor.cantidad('/notificaciones/31/leida'), 1);
  });

  testWidgets('el aviso que abrió la app no espera el registro del celular', (
    tester,
  ) async {
    final push = ServicioPushFalso(tokenPush: 'token-1')
      ..inicial = const MensajePush(notificacionId: 31, incidenteId: 9);
    final servidor = servidorConAvisos();
    final responder = servidor.responder;
    // Mala señal: el servidor nunca contesta el registro.
    servidor.responder = (pedido) => pedido.path == '/dispositivos'
        ? Completer<ResponseBody>().future
        : responder(pedido);
    await abrirApp(tester, servidor, servicioPush: push);

    expect(find.byType(PantallaIncidente), findsOneWidget);
  });

  testWidgets('un aviso tocado con la app en segundo plano abre la ficha', (
    tester,
  ) async {
    final push = ServicioPushFalso();
    final servidor = servidorConAvisos();
    await abrirApp(tester, servidor, servicioPush: push);

    push.abrir(const MensajePush(notificacionId: 31, incidenteId: 9));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaIncidente), findsOneWidget);
    expect(servidor.cantidad('/notificaciones/31/leida'), 1);
  });

  testWidgets('al volver a la app se vuelve a pedir la lista', (tester) async {
    final servidor = servidorConAvisos([avisoJson(31)]);
    await abrirApp(tester, servidor);
    final pedidos = servidor.cantidad('/notificaciones');

    // Un aviso llegó con la app en segundo plano y el vecino vuelve sin
    // tocarlo.
    for (final estado in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(estado);
    }
    await tester.pumpAndSettle();

    expect(servidor.cantidad('/notificaciones'), pedidos + 1);
  });

  testWidgets('un aviso sin incidente abre la lista', (tester) async {
    final push = ServicioPushFalso();
    await abrirApp(tester, servidorConAvisos(), servicioPush: push);

    push.recibir(
      const MensajePush(
        notificacionId: 30,
        tipo: 'VERIFICACION',
        titulo: 'Incidente verificado',
        cuerpo: 'Vecinos confirmaron el bache',
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Ver'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaAvisos), findsOneWidget);
  });

  testWidgets('al volver a la lista desde la barra, se vuelve a pedir', (
    tester,
  ) async {
    final servidor = servidorConAvisos([avisoJson(31)]);
    await abrirApp(tester, servidor);
    final pedidos = servidor.cantidad('/notificaciones');

    await tester.tap(find.byTooltip('Avisos (1 sin leer)'));
    await tester.pumpAndSettle();

    expect(servidor.cantidad('/notificaciones'), greaterThan(pedidos));
  });

  testWidgets('el aviso que abre la app y llega también como tocado se abre '
      'una sola vez', (tester) async {
    const aviso = MensajePush(notificacionId: 31, incidenteId: 9);
    final push = ServicioPushFalso()..inicial = aviso;
    final servidor = servidorConAvisos();
    await abrirApp(tester, servidor, servicioPush: push);

    // Así lo entrega FCM al abrir la app cerrada desde la notificación.
    push.abrir(aviso);
    await tester.pumpAndSettle();

    expect(find.byType(PantallaIncidente, skipOffstage: false), findsOneWidget);
    expect(servidor.cantidad('/notificaciones/31/leida'), 1);
  });

  testWidgets(
    'un aviso de un incidente con la ficha abierta la vuelve a pedir',
    (tester) async {
      final push = ServicioPushFalso();
      final servidor = servidorConAvisos();
      await abrirApp(tester, servidor, servicioPush: push);

      push.abrir(const MensajePush(notificacionId: 31, incidenteId: 9));
      await tester.pumpAndSettle();
      expect(servidor.cantidad('/incidentes/9'), 1);

      // Llega otro cambio del mismo incidente con su ficha a la vista.
      push.recibir(
        const MensajePush(
          notificacionId: 32,
          incidenteId: 9,
          titulo: 'Cambió el estado de un incidente',
        ),
      );
      await tester.pumpAndSettle();
      expect(servidor.cantidad('/incidentes/9'), 2);

      // Y al tocar «Ver», la ficha nueva tampoco usa la guardada.
      await tester.tap(find.text('Ver'));
      await tester.pumpAndSettle();
      expect(servidor.cantidad('/incidentes/9'), 3);
    },
  );
}
