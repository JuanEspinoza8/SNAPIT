import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/feed/pantalla_reporte.dart';
import 'package:snapit/funcionalidades/feed/social.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';
import 'pantalla_feed_test.dart' show tarjetaJson;

Map<String, Object?> autorJson(int id, String nombre) => {
  'id': id,
  'nombre': nombre,
};

Map<String, Object?> reporteJson(
  int id, {
  required Map<String, Object?> autor,
  int meGusta = 0,
  int comentarios = 0,
  String? descripcion = 'Una baldosa rota',
}) => {
  'id': id,
  'incidenteId': 3,
  'descripcion': descripcion,
  'creadoEn': '2026-10-06T15:15:33.494Z',
  'autor': autor,
  'fotos': [
    {'id': id * 10, 'url': '/api/fotos/${id * 10}'},
  ],
  'cantidadMeGusta': meGusta,
  'cantidadComentarios': comentarios,
};

Map<String, Object?> comentarioJson(
  int id,
  String texto, {
  required Map<String, Object?> autor,
  bool editado = false,
}) => {
  'id': id,
  'texto': texto,
  'creadoEn': '2026-10-07T15:15:33.494Z',
  'editadoEn': editado ? '2026-10-08T15:15:33.494Z' : null,
  'autor': autor,
};

final ana = autorJson(4, 'Ana Vecina');
final bruno = autorJson(5, 'Bruno Vecino');

/// Un vecino con sesión, un incidente (3) con dos fotos de vecinos distintos
/// y comentarios en el incidente y en la foto de Ana (31).
class ServidorSocial {
  ServidorSocial() {
    servidor = ServidorFalso(_responder);
  }

  late final ServidorFalso servidor;

  /// Si no es null, `GET /incidentes/3/comentarios` responde así.
  Future<ResponseBody> Function(RequestOptions pedido)? comentariosIncidente;

  Future<ResponseBody> _responder(RequestOptions pedido) {
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson()});
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/incidentes/feed':
        return json(200, {
          'incidentes': [
            {
              ...tarjetaJson(3, categoria: 'Vereda rota', reportes: 2),
              'cantidadMeGusta': 7,
              'cantidadComentarios': 4,
            },
          ],
          'siguiente': null,
        });
      case '/incidentes/3':
        return json(200, tarjetaJson(3, categoria: 'Vereda rota'));
      case '/incidentes/3/reportes':
        return json(200, {
          'incidenteId': 3,
          'reportes': [
            reporteJson(31, autor: ana, meGusta: 5, comentarios: 2),
            reporteJson(32, autor: bruno, meGusta: 2),
          ],
        });
      case '/incidentes/3/comentarios':
        return comentariosIncidente?.call(pedido) ??
            json(200, {
              'incidenteId': 3,
              'comentarios': [
                comentarioJson(1, 'Hay una escuela cerca', autor: bruno),
              ],
            });
      case '/reportes/31/publico':
        return json(
          200,
          reporteJson(
            31,
            autor: ana,
            meGusta: 5,
            comentarios: 2,
            descripcion: 'Frente al kiosco',
          ),
        );
      case '/reportes/31/comentarios':
        return json(200, {
          'comentarios': [
            comentarioJson(2, 'Confirmo, sigue igual', autor: bruno),
            comentarioJson(3, 'Casi me caigo', autor: ana, editado: true),
          ],
        });
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }
}

void main() {
  setUp(guardarSesion);

  // Alto de sobra para que el detalle entre entero sin scrollear.
  Future<void> abrir(WidgetTester tester, ServidorSocial servidor) async {
    tester.view.physicalSize = const Size(1080, 7000);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await abrirApp(tester, servidor.servidor);
  }

  Future<void> abrirIncidente(WidgetTester tester) async {
    await tester.tap(find.text('Vereda rota'));
    await tester.pumpAndSettle();
  }

  testWidgets('la tarjeta del feed muestra los me gusta y los comentarios', (
    tester,
  ) async {
    await abrir(tester, ServidorSocial());

    expect(find.bySemanticsLabel('7 me gusta, 4 comentarios'), findsOneWidget);
  });

  testWidgets('el incidente muestra una foto por vecino con su autor, y los '
      'comentarios del incidente', (tester) async {
    await abrir(tester, ServidorSocial());
    await abrirIncidente(tester);

    expect(find.text('Fotos de los vecinos (2)'), findsOneWidget);
    expect(
      find.bySemanticsLabel('Foto de Ana Vecina, 5 me gusta, 2 comentarios'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel('Foto de Bruno Vecino, 2 me gusta, 0 comentarios'),
      findsOneWidget,
    );
    expect(find.text('Comentarios del incidente (1)'), findsOneWidget);
    expect(find.text('Hay una escuela cerca'), findsOneWidget);
    expect(find.text('Bruno Vecino'), findsWidgets);
  });

  testWidgets(
    'tocar la foto de un vecino abre su reporte con sus comentarios',
    (tester) async {
      await abrir(tester, ServidorSocial());
      await abrirIncidente(tester);

      await tester.tap(
        find.bySemanticsLabel('Foto de Ana Vecina, 5 me gusta, 2 comentarios'),
      );
      await tester.pumpAndSettle();

      expect(find.byType(PantallaReporte), findsOneWidget);
      expect(
        find.widgetWithText(AppBar, 'Reporte de Ana Vecina'),
        findsOneWidget,
      );
      expect(find.text('Frente al kiosco'), findsOneWidget);
      expect(
        find.bySemanticsLabel('5 me gusta, 2 comentarios'),
        findsOneWidget,
      );
      expect(find.text('Comentarios (2)'), findsOneWidget);
      expect(find.text('Confirmo, sigue igual'), findsOneWidget);
      expect(find.textContaining('editado'), findsOneWidget);
    },
  );

  testWidgets('si los comentarios no cargan, el resto se ve y deja '
      'reintentar', (tester) async {
    final servidor = ServidorSocial()
      ..comentariosIncidente = (pedido) => sinConexion(pedido);
    await abrir(tester, servidor);
    await abrirIncidente(tester);

    expect(find.text('Fotos de los vecinos (2)'), findsOneWidget);
    expect(find.text('Hay una escuela cerca'), findsNothing);

    servidor.comentariosIncidente = null;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(find.text('Hay una escuela cerca'), findsOneWidget);
  });

  test('la inicial del autor sale del nombre, aunque tenga espacios', () {
    expect(const Autor(id: 1, nombre: ' ana').inicial, 'A');
    expect(const Autor(id: 1, nombre: '').inicial, '?');
  });
}
