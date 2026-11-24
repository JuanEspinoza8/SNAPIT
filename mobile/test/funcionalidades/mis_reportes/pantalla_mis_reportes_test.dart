import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/feed/pantalla_reporte.dart';
import 'package:snapit/funcionalidades/mis_reportes/repositorio_mis_reportes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/reportes_mios.dart';
import '../../apoyo/servidor_falso.dart';
import '../../apoyo/social.dart';

const fichaJson = {
  'id': 9,
  'lat': -38.9516,
  'lon': -68.0591,
  'categoria': {'id': 3, 'nombre': 'Cordón sin rampa'},
  'estado': 'REGISTRADO',
  'enRevision': true,
  'primerReporteEn': '2026-10-06T15:15:33.494Z',
  'cantidadReportes': 1,
  'cantidadVecinos': 1,
  'cantidadConfirmaciones': 1,
  'direccion': null,
  'fotos': [
    {'id': 1, 'url': '/api/fotos/1'},
  ],
};

/// El servidor de una sesión de vecino. [mios] es lo que contesta
/// `GET /reportes/mios`; por defecto, la lista [reportes]. Las fotos dan 404
/// salvo que se cargue [fotos].
class ServidorMisReportes {
  ServidorMisReportes([List<Map<String, Object?>>? reportes])
    : reportes = reportes ?? [] {
    servidor = ServidorFalso(_responder);
  }

  late final ServidorFalso servidor;
  List<Map<String, Object?>> reportes;
  Future<ResponseBody> Function(RequestOptions pedido)? mios;
  Uint8List? fotos;

  /// Si no es null, `DELETE /reportes/:id` responde así.
  Future<ResponseBody> Function(RequestOptions pedido)? eliminar;

  int get pedidosLista => servidor.cantidad('/reportes/mios');

  Future<ResponseBody> _responder(RequestOptions pedido) {
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson()});
      case '/auth/salir':
        return json(204, '');
      case '/incidentes':
        return json(200, {'incidentes': <Object>[]});
      case '/incidentes/9':
        return json(200, fichaJson);
      case '/incidentes/9/seguimiento':
        return json(200, {'siguiendo': false});
      // La publicación del reporte 15, como la ve su autor.
      case '/social/reportes/15':
        return json(200, {
          'id': 15,
          'incidenteId': 9,
          'descripcion': 'Pozo grande frente a la escuela',
          'creadoEn': '2026-10-06T15:15:33.494Z',
          'autor': autorJson(1),
          'fotos': [
            {'id': 1, 'url': '/api/fotos/1'},
          ],
          'cantidadMeGusta': 0,
          'cantidadComentarios': 1,
          'yaMeGusta': false,
        });
      case '/social/reportes/15/comentarios':
        return json(200, {
          'comentarios': [
            comentarioJson(
              1,
              '¡Gracias por tu reporte! Ya está publicado.',
              autor: snapitJson,
            ),
          ],
        });
      case '/reportes/mios':
        return mios?.call(pedido) ?? json(200, {'reportes': reportes});
      case final ruta
          when ruta.startsWith('/reportes/') && pedido.method == 'DELETE':
        if (eliminar case final responder?) return responder(pedido);
        final id = int.parse(ruta.split('/').last);
        reportes = [
          for (final r in reportes)
            if (r['id'] != id) r,
        ];
        return json(204, '');
      case '/social/feed':
        return json(200, {'reportes': <Object>[], 'siguiente': null});
      case final ruta when ruta.startsWith('/fotos/') && fotos != null:
        return imagen(fotos!);
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }
}

void main() {
  setUp(guardarSesion);

  Future<void> abrirMisReportes(
    WidgetTester tester,
    ServidorMisReportes servidor,
  ) async {
    await abrirApp(tester, servidor.servidor);
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// La fila de la lista que contiene [texto].
  Finder fila(String texto) =>
      find.ancestor(of: find.text(texto), matching: find.byType(InkWell));

  testWidgets('no pide la lista hasta que se abre la pestaña', (tester) async {
    final servidor = ServidorMisReportes();
    await abrirApp(tester, servidor.servidor);
    expect(servidor.pedidosLista, 0);

    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();

    expect(servidor.pedidosLista, 1);
  });

  testWidgets('sin reportes muestra un mensaje y lleva a reportar', (
    tester,
  ) async {
    await abrirMisReportes(tester, ServidorMisReportes());

    expect(find.text('Todavía no hiciste reportes'), findsOneWidget);
    expect(find.byType(ListView), findsNothing);

    await tester.tap(find.text('Reportar un problema'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Reportar un problema'), findsOneWidget);
  });

  testWidgets(
    'cada reporte tiene categoría, fecha y estado con texto e ícono',
    (tester) async {
      final servidor = ServidorMisReportes([
        reporteJson(id: 17),
        reporteJson(
          id: 16,
          estadoVerificacion: 'VERIFICADO',
          incidente: const {'id': 8, 'estado': 'RESUELTO', 'enRevision': false},
        ),
        reporteJson(
          id: 15,
          estadoVerificacion: 'DESESTIMADO',
          incidente: const {
            'id': 7,
            'estado': 'VERIFICADO',
            'enRevision': false,
          },
        ),
      ]);
      await abrirMisReportes(tester, servidor);

      expect(find.text('Cordón sin rampa'), findsNWidgets(3));
      expect(find.text('6 de octubre de 2026'), findsNWidgets(3));
      for (final (texto, icono) in [
        ('En revisión', Icons.hourglass_empty),
        ('Resuelto', Icons.done_all),
        ('Desestimado', Icons.block),
      ]) {
        final etiqueta = find.ancestor(
          of: find.text(texto),
          matching: find.byType(Row),
        );
        expect(
          find.descendant(of: etiqueta.first, matching: find.byIcon(icono)),
          findsOneWidget,
          reason: texto,
        );
      }
      // El orden es el del servidor: del más nuevo al más viejo.
      final textos = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data)
          .where((t) => ['En revisión', 'Resuelto', 'Desestimado'].contains(t));
      expect(textos, ['En revisión', 'Resuelto', 'Desestimado']);
    },
  );

  testWidgets('tocar uno publicado abre su publicación, con el agradecimiento '
      'de SnapIt', (tester) async {
    final servidor = ServidorMisReportes([
      reporteJson(
        estadoVerificacion: 'VERIFICADO',
        incidente: const {
          'id': 9,
          'estado': 'VERIFICADO',
          'enRevision': false,
          'caducadoEn': null,
        },
      ),
    ]);
    // Alto de sobra para que la publicación entre entera sin scrollear.
    tester.view.physicalSize = const Size(1080, 3 * 3000);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await abrirMisReportes(tester, servidor);

    await tester.tap(fila('Cordón sin rampa'));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaReporte), findsOneWidget);
    expect(servidor.servidor.cantidad('/social/reportes/15'), 1);
    expect(
      find.text('¡Gracias por tu reporte! Ya está publicado.'),
      findsOneWidget,
    );
  });

  testWidgets('tocar uno que no se publicó abre la ficha de su incidente', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    await abrirMisReportes(tester, servidor);

    await tester.tap(fila('Cordón sin rampa'));
    await tester.pumpAndSettle();

    expect(servidor.servidor.cantidad('/incidentes/9'), 1);
    expect(find.text('Vecinos que lo reportaron'), findsOneWidget);
  });

  testWidgets('con el incidente desestimado no abre nada: no tiene ficha', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([
      reporteJson(
        estadoVerificacion: 'DESESTIMADO',
        incidente: const {
          'id': 9,
          'estado': 'DESESTIMADO',
          'enRevision': false,
        },
      ),
    ]);
    await abrirMisReportes(tester, servidor);

    await tester.tap(find.text('Cordón sin rampa'));
    await tester.pumpAndSettle();

    expect(servidor.servidor.cantidad('/incidentes/9'), 0);
    expect(find.byIcon(Icons.chevron_right), findsNothing);
  });

  testWidgets('con el incidente caducado no abre nada: ya no está en el mapa', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([
      reporteJson(
        estadoVerificacion: 'VERIFICADO',
        incidente: const {
          'id': 9,
          'estado': 'VERIFICADO',
          'enRevision': false,
          'caducadoEn': '2026-11-01T03:00:00.000Z',
        },
      ),
    ]);
    await abrirMisReportes(tester, servidor);

    await tester.tap(find.text('Cordón sin rampa'));
    await tester.pumpAndSettle();

    expect(servidor.servidor.cantidad('/social/reportes/15'), 0);
    expect(servidor.servidor.cantidad('/incidentes/9'), 0);
    expect(find.byIcon(Icons.chevron_right), findsNothing);
  });

  testWidgets('con el incidente caducado dice cuándo caducó, con texto e '
      'ícono', (tester) async {
    await abrirMisReportes(
      tester,
      ServidorMisReportes([
        reporteJson(
          estadoVerificacion: 'VERIFICADO',
          incidente: const {
            'id': 9,
            'estado': 'DERIVADO',
            'enRevision': false,
            // Medianoche del 1 de noviembre en Argentina.
            'caducadoEn': '2026-11-01T03:00:00.000Z',
          },
        ),
      ]),
    );

    final texto = find.text('Caducó el 1 de noviembre de 2026');
    final etiqueta = find.ancestor(of: texto, matching: find.byType(Row));
    expect(
      find.descendant(
        of: etiqueta.first,
        matching: find.byIcon(Icons.event_busy),
      ),
      findsOneWidget,
    );
    // Caducar no es un estado: borde y texto secundario, sin color de estado.
    final esquema = Theme.of(tester.element(texto)).colorScheme;
    final caja = tester.widget<DecoratedBox>(
      find.ancestor(of: texto, matching: find.byType(DecoratedBox)).first,
    );
    final decoracion = caja.decoration as BoxDecoration;
    expect(decoracion.color, isNull);
    expect(decoracion.border, Border.all(color: esquema.outline));
    expect(tester.widget<Text>(texto).style?.color, esquema.onSurfaceVariant);
    expect(
      tester.widget<Icon>(find.byIcon(Icons.event_busy)).color,
      esquema.onSurfaceVariant,
    );
    // En vez del estado del incidente, que ya no se puede ver.
    expect(find.text('Derivado'), findsNothing);
    // TalkBack lo lee con el resto de la fila.
    expect(
      find.bySemanticsLabel(RegExp('Caducó el 1 de noviembre de 2026')),
      findsOneWidget,
    );
  });

  testWidgets('si el reporte propio se desestimó, dice eso aunque el '
      'incidente haya caducado', (tester) async {
    await abrirMisReportes(
      tester,
      ServidorMisReportes([
        reporteJson(
          estadoVerificacion: 'DESESTIMADO',
          incidente: const {
            'id': 9,
            'estado': 'VERIFICADO',
            'enRevision': false,
            'caducadoEn': '2026-11-01T03:00:00.000Z',
          },
        ),
      ]),
    );

    expect(find.text('Desestimado'), findsOneWidget);
    expect(find.textContaining('Caducó'), findsNothing);
  });

  testWidgets(
    'baja la foto con la sesión y la muestra, aunque el reporte esté desestimado',
    (tester) async {
      final servidor = ServidorMisReportes([
        reporteJson(
          estadoVerificacion: 'DESESTIMADO',
          incidente: const {
            'id': 9,
            'estado': 'DESESTIMADO',
            'enRevision': false,
          },
        ),
      ])..fotos = pngDePrueba;
      await abrirMisReportes(tester, servidor);

      final pedido = servidor.servidor.pedidos.singleWhere(
        (p) => p.ruta == '/fotos/1',
      );
      expect(pedido.token, 'Bearer acceso-1');
      expect(find.byType(Image), findsOneWidget);
      expect(find.byIcon(Icons.hide_image_outlined), findsNothing);
    },
  );

  testWidgets('una foto que no se puede bajar deja un recuadro', (
    tester,
  ) async {
    // Sin fotos cargadas, el servidor falso contesta 404.
    final servidor = ServidorMisReportes([
      reporteJson(),
      reporteJson(id: 16, fotos: const []),
    ]);
    await abrirMisReportes(tester, servidor);

    expect(find.byIcon(Icons.hide_image_outlined), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('una foto que llega pero no se puede mostrar deja un recuadro', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([reporteJson()])
      ..fotos = Uint8List.fromList(utf8.encode('no es una imagen'));
    await abrirMisReportes(tester, servidor);
    // La imagen se decodifica fuera del reloj simulado del test.
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.hide_image_outlined), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sin conexión lo dice y Reintentar vuelve a pedir', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    servidor.mios = sinConexion;
    await abrirMisReportes(tester, servidor);

    expect(find.textContaining('conexión'), findsOneWidget);
    expect(find.text('Cordón sin rampa'), findsNothing);

    servidor.mios = null;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();

    expect(servidor.pedidosLista, 2);
    expect(find.text('Cordón sin rampa'), findsOneWidget);
  });

  testWidgets('deslizar hacia abajo trae los cambios de estado', (
    tester,
  ) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    await abrirMisReportes(tester, servidor);
    expect(find.text('En revisión'), findsOneWidget);

    servidor.reportes = [
      reporteJson(
        estadoVerificacion: 'VERIFICADO',
        incidente: const {'id': 9, 'estado': 'DERIVADO', 'enRevision': false},
      ),
    ];
    await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();

    expect(servidor.pedidosLista, 2);
    expect(find.text('Derivado al área'), findsOneWidget);
  });

  testWidgets('la lista vacía también se recarga deslizando', (tester) async {
    final servidor = ServidorMisReportes();
    await abrirMisReportes(tester, servidor);

    servidor.reportes = [reporteJson()];
    await tester.fling(
      find.text('Todavía no hiciste reportes'),
      const Offset(0, 300),
      1000,
    );
    await tester.pumpAndSettle();

    expect(find.text('Cordón sin rampa'), findsOneWidget);
  });

  testWidgets('si la recarga falla, la lista sigue y avisa', (tester) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    await abrirMisReportes(tester, servidor);

    servidor.mios = sinConexion;
    await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Cordón sin rampa'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(SnackBar),
        matching: find.textContaining('conexión'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('al salir de la cuenta, la lista se descarta', (tester) async {
    final servidor = ServidorMisReportes([reporteJson()]);
    final contenedor = await abrirApp(tester, servidor.servidor);
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();
    expect(contenedor.exists(misReportesProvider), isTrue);

    // Los ajustes de la cuenta están en «Mi perfil», en la rueda de arriba.
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Mi perfil'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ajustes de la cuenta'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salir'));
    await tester.pumpAndSettle();

    expect(contenedor.exists(misReportesProvider), isFalse);
  });

  group('eliminar un reporte propio', () {
    Future<void> elegirEliminar(WidgetTester tester) async {
      await tester.tap(
        find.byTooltip('Opciones de tu reporte de Cordón sin rampa').first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Eliminar'));
      await tester.pumpAndSettle();
    }

    testWidgets('pide confirmación, lo elimina y deja de verse', (
      tester,
    ) async {
      final servidor = ServidorMisReportes([
        reporteJson(id: 15),
        reporteJson(id: 16),
      ]);
      await abrirMisReportes(tester, servidor);
      expect(find.text('Cordón sin rampa'), findsNWidgets(2));

      await elegirEliminar(tester);
      expect(
        find.text('¿Eliminar tu reporte de Cordón sin rampa?'),
        findsOneWidget,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Eliminar'));
      await tester.pumpAndSettle();

      expect(find.text('Cordón sin rampa'), findsOneWidget);
      expect(
        servidor.servidor.pedidos
            .where((p) => p.metodo == 'DELETE')
            .single
            .ruta,
        '/reportes/15',
      );
    });

    testWidgets('si cancela, no se elimina nada', (tester) async {
      final servidor = ServidorMisReportes([reporteJson(id: 15)]);
      await abrirMisReportes(tester, servidor);

      await elegirEliminar(tester);
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(find.text('Cordón sin rampa'), findsOneWidget);
      expect(
        servidor.servidor.pedidos.where((p) => p.metodo == 'DELETE'),
        isEmpty,
      );
    });

    testWidgets('si es el único reporte de su problema, explica por qué no se '
        'puede y el reporte queda', (tester) async {
      final servidor = ServidorMisReportes([reporteJson(id: 15)])
        ..eliminar = (_) => errorApi(
          409,
          'UNICO_REPORTE',
          'Es el único reporte de este problema: no se puede eliminar sin '
              'dejarlo vacío',
        );
      await abrirMisReportes(tester, servidor);

      await elegirEliminar(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Eliminar'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Es el único reporte de este problema'),
        findsOneWidget,
      );
      expect(find.text('Cordón sin rampa'), findsOneWidget);
    });
  });
}
