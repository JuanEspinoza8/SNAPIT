import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/funcionalidades/mapa/ubicacion.dart';
import 'package:snapit/funcionalidades/reportar/pantalla_elegir_punto.dart';
import 'package:snapit/funcionalidades/reportar/selector_foto.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

/// Donde está el vecino según el GPS: el centro de Neuquén.
const gps = LatLng(-38.9516, -68.0591);

const categoriasJson = {
  'categorias': [
    {'id': 1, 'nombre': 'Bache'},
    {'id': 3, 'nombre': 'Cordón sin rampa'},
  ],
};

/// El servidor de una sesión de vecino. Los reportes que recibe aparecen en
/// `GET /incidentes`, como en el servidor real. [reportes] decide qué contesta
/// `POST /reportes`; por defecto, 201.
class ServidorDeReportes {
  ServidorDeReportes() {
    servidor = ServidorFalso(_responder);
  }

  late final ServidorFalso servidor;
  Future<ResponseBody> Function(RequestOptions pedido)? reportes;
  Future<ResponseBody> Function(RequestOptions pedido)? categorias;
  final incidentes = <Map<String, Object?>>[];

  List<FormData> get enviados => [
    for (final pedido in servidor.pedidos)
      if (pedido.ruta == '/reportes') pedido.datos as FormData,
  ];

  Future<ResponseBody> _responder(RequestOptions pedido) {
    switch (pedido.path) {
      case '/auth/yo':
        return json(200, {'usuario': usuarioJson()});
      case '/categorias':
        return categorias?.call(pedido) ?? json(200, categoriasJson);
      case '/incidentes':
        return json(200, {'incidentes': incidentes});
      case '/reportes':
        if (reportes case final responder?) return responder(pedido);
        final campos = Map.fromEntries((pedido.data as FormData).fields);
        incidentes.add({
          'id': 9,
          'lat': double.parse(campos['lat']!),
          'lon': double.parse(campos['lon']!),
          'categoriaId': 1,
          'categoriaNombre': 'Bache',
          'estado': 'REGISTRADO',
          'enRevision': true,
          'primerReporteEn': '2026-10-10T17:30:00.000Z',
          'cantidadReportes': 1,
        });
        return json(201, {
          'id': 15,
          'incidenteId': 9,
          'nivelConfianza': 0,
          'estadoVerificacion': 'PENDIENTE_REVISION',
        });
      default:
        return errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe');
    }
  }
}

Map<String, String> campos(FormData formulario) =>
    Map.fromEntries(formulario.fields);

void main() {
  late Directory carpeta;
  late String foto;

  setUpAll(() {
    carpeta = Directory.systemTemp.createTempSync('pantalla_reportar');
    foto = '${carpeta.path}/pozo.jpg';
    File(foto).writeAsBytesSync([0xFF, 0xD8, 0xFF, 0xD9]);
  });

  tearDownAll(() {
    // Ver repositorio_reportes_test.dart: en Windows puede seguir abierta.
    try {
      carpeta.deleteSync(recursive: true);
    } on FileSystemException catch (_) {}
  });

  setUp(guardarSesion);

  /// Entra como vecino, en un celular de 360 × 780, y abre «Reportar».
  Future<void> abrirReportar(
    WidgetTester tester,
    ServidorDeReportes servidor, {
    UbicacionFalsa? ubicacion,
    SelectorFotoFalso? selector,
  }) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await abrirApp(
      tester,
      servidor.servidor,
      ubicacion: ubicacion ?? UbicacionFalsa(gps),
      selectorFoto: selector ?? SelectorFotoFalso(foto),
    );
    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();
  }

  Future<void> tocar(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  // La etiqueta flotante no recibe el toque: se toca el campo.
  final campoCategoria = find.widgetWithText(
    DropdownButtonFormField<int>,
    'Categoría',
  );

  /// Foto con la cámara, «Bache», «Grave» y una descripción.
  Future<void> completar(WidgetTester tester) async {
    await tocar(tester, find.text('Sacar foto'));
    await tocar(tester, campoCategoria);
    await tester.tap(find.text('Bache').last);
    await tester.pumpAndSettle();
    await tocar(tester, find.text('Grave'));
    await tester.enterText(
      find.widgetWithText(TextField, 'Descripción (opcional)'),
      'Pozo frente a la escuela',
    );
    await tester.pumpAndSettle();
  }

  Future<void> enviar(WidgetTester tester) =>
      tocar(tester, find.text('Enviar reporte'));

  group('ubicación', () {
    testWidgets('sin permiso explica qué hacer y no deja enviar', (
      tester,
    ) async {
      final servidor = ServidorDeReportes();
      final ubicacion = UbicacionFalsa(null, ProblemaUbicacion.sinPermiso);
      await abrirReportar(tester, servidor, ubicacion: ubicacion);

      expect(
        find.textContaining('Para reportar hace falta saber dónde está'),
        findsOneWidget,
      );
      await completar(tester);
      await enviar(tester);
      expect(find.text('Falta la ubicación'), findsNothing);
      expect(
        find.text('Faltan datos: revisá los campos marcados.'),
        findsOneWidget,
      );
      expect(servidor.enviados, isEmpty);

      // La persona acepta el permiso.
      ubicacion.posicion = gps;
      await tocar(tester, find.text('Permitir ubicación'));

      expect(find.text('Mover el punto'), findsOneWidget);
      await enviar(tester);
      expect(servidor.enviados, hasLength(1));
    });

    for (final (problema, boton) in [
      (ProblemaUbicacion.apagada, 'Activar la ubicación'),
      (ProblemaUbicacion.sinPermisoParaSiempre, 'Abrir los ajustes'),
    ]) {
      testWidgets('${problema.name}: «$boton» lleva a los ajustes y al volver '
          'reintenta solo', (tester) async {
        final ubicacion = UbicacionFalsa(null, problema);
        await abrirReportar(tester, ServidorDeReportes(), ubicacion: ubicacion);

        await tocar(tester, find.text(boton));
        expect(ubicacion.ajustesAbiertos, [problema]);

        // La persona lo resuelve en los ajustes y vuelve a la app.
        ubicacion.posicion = gps;
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

        expect(find.text('Mover el punto'), findsOneWidget);
      });
    }

    testWidgets('sin señal deja reintentar', (tester) async {
      final ubicacion = UbicacionFalsa(null, ProblemaUbicacion.sinSenal);
      await abrirReportar(tester, ServidorDeReportes(), ubicacion: ubicacion);

      expect(find.textContaining('salí al aire libre'), findsOneWidget);
      ubicacion.posicion = gps;
      await tocar(tester, find.text('Reintentar'));

      expect(find.text('Mover el punto'), findsOneWidget);
      expect(ubicacion.pedidosParaReportar, 2);
    });
  });

  testWidgets('al servidor llega el punto corregido, no el del GPS', (
    tester,
  ) async {
    final servidor = ServidorDeReportes();
    await abrirReportar(tester, servidor);
    await completar(tester);

    await tocar(tester, find.text('Mover el punto'));
    expect(find.byType(PantallaElegirPunto), findsOneWidget);
    // Arrastrar el mapa a la izquierda deja en el centro un punto más al este.
    await tester.drag(find.byType(FlutterMap), const Offset(-150, 0));
    await tester.pumpAndSettle();
    await tocar(tester, find.text('Usar este punto'));

    expect(find.text('Elegiste el punto en el mapa.'), findsOneWidget);
    // La descripción tenía el foco: al volver no se reabre el teclado.
    expect(tester.testTextInput.isVisible, isFalse);
    await enviar(tester);

    final enviado = campos(servidor.enviados.single);
    expect(double.parse(enviado['lon']!), greaterThan(gps.longitude));
    expect(double.parse(enviado['lat']!), closeTo(gps.latitude, 1e-5));
    expect(enviado['categoriaId'], '1');
    expect(enviado['severidadDeclarada'], 'GRAVE');
    expect(enviado['descripcion'], 'Pozo frente a la escuela');
    expect(enviado['origen'], 'APP_MOVIL');
    expect(enviado['tomadaConCamaraApp'], 'true');
    expect(servidor.enviados.single.files.single.value.filename, 'pozo.jpg');
    expect(find.text('Reporte enviado'), findsOneWidget);
  });

  testWidgets('volver del mapa sin elegir deja el punto del GPS', (
    tester,
  ) async {
    final servidor = ServidorDeReportes();
    await abrirReportar(tester, servidor);
    await completar(tester);

    await tocar(tester, find.text('Mover el punto'));
    await tester.drag(find.byType(FlutterMap), const Offset(-150, 0));
    await tester.pumpAndSettle();
    // `pageBack()` busca el tooltip en inglés; la app está en castellano.
    await tocar(tester, find.byTooltip('Atrás'));
    await enviar(tester);

    final enviado = campos(servidor.enviados.single);
    expect(enviado['lat'], '${gps.latitude}');
    expect(enviado['lon'], '${gps.longitude}');
  });

  group('tomadaConCamaraApp', () {
    testWidgets('es falso si la foto se eligió de la galería', (tester) async {
      final servidor = ServidorDeReportes();
      final selector = SelectorFotoFalso(foto);
      await abrirReportar(tester, servidor, selector: selector);

      await completar(tester);
      // Después de la de la cámara, elige otra de la galería: vale la última.
      await tocar(tester, find.text('Galería'));
      await enviar(tester);

      expect(selector.fuentes, [FuenteFoto.camara, FuenteFoto.galeria]);
      expect(campos(servidor.enviados.single)['tomadaConCamaraApp'], 'false');
    });

    testWidgets('si la cámara no se puede abrir, lo dice y ofrece la galería', (
      tester,
    ) async {
      final selector = SelectorFotoFalso(foto)
        ..error = ErrorFoto(
          mensajeErrorFoto('camera_access_denied', FuenteFoto.camara),
        );
      await abrirReportar(tester, ServidorDeReportes(), selector: selector);

      await tocar(tester, find.text('Sacar foto'));

      expect(
        find.textContaining('SnapIt no tiene permiso para usar la cámara'),
        findsOneWidget,
      );
      expect(find.text('Elegir de la galería'), findsOneWidget);
    });
  });

  testWidgets('la gravedad elegida no parte la palabra', (tester) async {
    await abrirReportar(tester, ServidorDeReportes());

    await tocar(tester, find.text('Moderada'));

    // Con la tilde de elegido, «Moderada» queda en una línea, como «Leve».
    expect(
      tester.getSize(find.text('Moderada')).height,
      tester.getSize(find.text('Leve')).height,
    );
  });

  testWidgets('sin completar marca cada campo que falta', (tester) async {
    final servidor = ServidorDeReportes();
    await abrirReportar(tester, servidor);

    await enviar(tester);

    expect(
      find.text('Sacá una foto o elegí una de la galería'),
      findsOneWidget,
    );
    expect(find.text('Elegí una categoría'), findsOneWidget);
    expect(find.text('Elegí la gravedad'), findsOneWidget);
    expect(servidor.enviados, isEmpty);
  });

  group('si falla el envío', () {
    testWidgets('lo cargado sigue y el reintento manda lo mismo', (
      tester,
    ) async {
      final servidor = ServidorDeReportes()..reportes = sinConexion;
      await abrirReportar(tester, servidor);
      await completar(tester);

      await enviar(tester);

      expect(
        find.text(
          'No se pudo conectar con el servidor. Revisá tu conexión e intentá '
          'de nuevo.',
        ),
        findsOneWidget,
      );
      expect(find.text('Sacar otra'), findsOneWidget);
      expect(find.text('Bache'), findsOneWidget);
      expect(find.text('Pozo frente a la escuela'), findsOneWidget);
      expect(find.text('Mover el punto'), findsOneWidget);

      servidor.reportes = null;
      await enviar(tester);

      expect(find.text('Reporte enviado'), findsOneWidget);
      final [primero, segundo] = servidor.enviados.map(campos).toList();
      // La fecha de registro es la del primer intento.
      expect(segundo, primero);
    });

    testWidgets('el error de un campo aparece debajo de ese campo', (
      tester,
    ) async {
      final servidor = ServidorDeReportes()
        ..reportes = (_) => json(400, {
          'error': {
            'codigo': 'DATOS_INVALIDOS',
            'mensaje': 'Hay datos inválidos',
            'detalles': [
              {'campo': 'categoriaId', 'mensaje': 'No existe o no está activa'},
              {
                'campo': 'foto',
                'mensaje': 'Tiene que ser una imagen JPG o PNG',
              },
            ],
          },
        });
      await abrirReportar(tester, servidor);
      await completar(tester);

      await enviar(tester);

      expect(find.text('No existe o no está activa'), findsOneWidget);
      expect(find.text('Tiene que ser una imagen JPG o PNG'), findsOneWidget);
      expect(find.text('Hay datos inválidos'), findsOneWidget);

      // Cambiar la foto borra su error; el de la categoría sigue.
      await tocar(tester, find.text('Galería'));
      expect(find.text('Tiene que ser una imagen JPG o PNG'), findsNothing);
      expect(find.text('No existe o no está activa'), findsOneWidget);
    });
  });

  testWidgets('el reporte enviado aparece en el mapa', (tester) async {
    final servidor = ServidorDeReportes();
    await abrirReportar(tester, servidor);
    await completar(tester);
    await enviar(tester);
    final pedidosAntes = servidor.servidor.cantidad('/incidentes');

    await tocar(tester, find.text('Ver en el mapa'));
    // El mapa pide los puntos cuando se queda quieto (300 ms).
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Mapa de incidentes'), findsOneWidget);
    expect(
      servidor.servidor.cantidad('/incidentes'),
      greaterThan(pedidosAntes),
    );
    expect(find.bySemanticsLabel('Bache, En revisión'), findsOneWidget);
  });

  testWidgets('también aparece si se vuelve al mapa por la pestaña', (
    tester,
  ) async {
    final servidor = ServidorDeReportes();
    await abrirReportar(tester, servidor);
    // El mapa ya mostró la zona, todavía sin el reporte.
    expect(servidor.servidor.cantidad('/incidentes'), greaterThan(0));
    await completar(tester);
    await enviar(tester);

    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Bache, En revisión'), findsOneWidget);
  });

  testWidgets('«Reportar otro» arranca vacío y vuelve a leer el GPS', (
    tester,
  ) async {
    final ubicacion = UbicacionFalsa(gps);
    await abrirReportar(tester, ServidorDeReportes(), ubicacion: ubicacion);
    await completar(tester);
    await enviar(tester);

    await tocar(tester, find.text('Reportar otro problema'));

    expect(find.text('Sacar foto'), findsOneWidget);
    expect(find.text('Bache'), findsNothing);
    expect(find.text('Pozo frente a la escuela'), findsNothing);
    expect(ubicacion.pedidosParaReportar, 2);
  });

  testWidgets('cambiar de pestaña no pierde lo cargado', (tester) async {
    await abrirReportar(tester, ServidorDeReportes());
    await completar(tester);

    await tester.tap(find.text('Mapa'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();

    expect(find.text('Bache'), findsOneWidget);
    expect(find.text('Pozo frente a la escuela'), findsOneWidget);
  });

  testWidgets('si no cargan las categorías, deja reintentar', (tester) async {
    final servidor = ServidorDeReportes()
      ..categorias = (_) => errorApi(500, 'ERROR_INTERNO', 'Error interno');
    await abrirReportar(tester, servidor);

    expect(find.text('Error interno'), findsOneWidget);
    servidor.categorias = null;
    await tocar(tester, find.text('Reintentar'));

    await tocar(tester, campoCategoria);
    expect(find.text('Cordón sin rampa'), findsWidgets);
  });
}
