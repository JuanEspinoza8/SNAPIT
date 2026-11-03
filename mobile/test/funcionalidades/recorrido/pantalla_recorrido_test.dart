import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/recorrido/repositorio_recorrido.dart';
import 'package:snapit/funcionalidades/reportar/pantalla_elegir_punto.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/recorrido.dart';
import '../../apoyo/servidor_falso.dart';

/// Responde como el servidor. Con una vereda rota en el camino corto, la silla
/// de ruedas (perfil 1) tiene que dar la vuelta y el bastón (perfil 2) no.
class ServidorDeRecorridos extends ServidorFalso {
  ServidorDeRecorridos({this.perfilDelUsuario = 1})
    : super((_) => json(500, {}));

  final int? perfilDelUsuario;

  /// Si no es null, `/recorridos` responde este error.
  Future<ResponseBody> Function()? errorRecorrido;
  Future<ResponseBody> Function()? respuestaBusqueda;

  List<Map<String, dynamic>> get consultasRecorrido => [
    for (final pedido in pedidos)
      if (pedido.ruta == '/recorridos') pedido.consulta,
  ];

  @override
  Future<ResponseBody> Function(RequestOptions pedido) get responder =>
      (pedido) => switch (pedido.path) {
        '/zona-piloto' => json(200, zonaPilotoJson),
        '/perfiles-movilidad' => json(200, perfilesJson),
        '/incidentes' => json(200, {'incidentes': <Object>[]}),
        '/geocodificacion' =>
          respuestaBusqueda?.call() ?? json(200, lugaresJson),
        '/recorridos' =>
          errorRecorrido?.call() ??
              json(
                200,
                recorridoJson(
                  metros: pedido.queryParameters['perfilId'] == '1' ? 650 : 450,
                ),
              ),
        _ => json(200, {
          'usuario': usuarioJson(perfilMovilidadId: perfilDelUsuario),
        }),
      };
}

/// Abre la app con sesión de vecino, en un celular de 360 × 780, y entra a
/// la pestaña Recorrido.
Future<void> abrirRecorrido(
  WidgetTester tester,
  ServidorFalso servidor, {
  UbicacionFalsa? ubicacion,
}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  guardarSesion();

  await abrirApp(
    tester,
    servidor,
    ubicacion: ubicacion ?? UbicacionFalsa(origenEnZona),
  );
  await tester.tap(find.text('Recorrido'));
  await tester.pumpAndSettle();
}

Future<void> tocar(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> origenEnMiUbicacion(WidgetTester tester) async {
  await tocar(tester, find.text('Elegí desde dónde salís'));
  await tocar(tester, find.text('Mi ubicación actual'));
}

Future<void> destinoPorDireccion(WidgetTester tester) async {
  await tocar(tester, find.text('Elegí a dónde vas'));
  await tocar(tester, find.text('Buscar una dirección'));
  await tester.enterText(find.byType(TextField), 'Saavedra 500');
  await tocar(tester, find.text('Buscar'));
  await tocar(tester, find.text('Cornelio Saavedra 500, La Sirena'));
}

Future<void> elegirPerfil(
  WidgetTester tester,
  String actual,
  String nuevo,
) async {
  await tocar(tester, find.text(actual));
  await tocar(tester, find.text(nuevo).last);
}

void main() {
  testWidgets('dibuja la zona piloto y arranca con el perfil del usuario', (
    tester,
  ) async {
    await abrirRecorrido(tester, ServidorDeRecorridos());

    expect(find.byType(PolygonLayer), findsOneWidget);
    expect(find.text('Silla de ruedas'), findsOneWidget);
    expect(find.text('Elegí desde dónde salís y a dónde vas.'), findsOneWidget);
  });

  testWidgets(
    'con origen, destino y perfil dibuja el recorrido con distancia y '
    'tiempo',
    (tester) async {
      final servidor = ServidorDeRecorridos();
      await abrirRecorrido(tester, servidor);

      await origenEnMiUbicacion(tester);
      await destinoPorDireccion(tester);

      expect(find.bySemanticsLabel('Desde: Tu ubicación'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Hasta: Cornelio Saavedra 500, La Sirena'),
        findsOneWidget,
      );
      expect(find.text('650 m · 13 min caminando'), findsOneWidget);
      expect(find.byType(PolylineLayer), findsOneWidget);
      expect(servidor.consultasRecorrido.single, {
        'origen': puntoApi(origenEnZona),
        'destino': puntoApi(destinoEnZona),
        'perfilId': '1',
      });
    },
  );

  testWidgets('cambiar de perfil recalcula el recorrido y se nota la '
      'diferencia', (tester) async {
    final servidor = ServidorDeRecorridos();
    await abrirRecorrido(tester, servidor);
    await origenEnMiUbicacion(tester);
    await destinoPorDireccion(tester);
    expect(find.text('650 m · 13 min caminando'), findsOneWidget);

    await elegirPerfil(tester, 'Silla de ruedas', 'Bastón o andador');

    expect(find.text('450 m · 9 min caminando'), findsOneWidget);
    expect(servidor.consultasRecorrido.map((c) => c['perfilId']), ['1', '2']);
  });

  testWidgets('sin perfil elegido pide elegirlo antes de calcular', (
    tester,
  ) async {
    final servidor = ServidorDeRecorridos(perfilDelUsuario: null);
    await abrirRecorrido(tester, servidor);
    await origenEnMiUbicacion(tester);
    await destinoPorDireccion(tester);

    expect(
      find.text('Elegí tu perfil de movilidad para calcular el recorrido.'),
      findsOneWidget,
    );
    expect(servidor.consultasRecorrido, isEmpty);

    await elegirPerfil(tester, 'Elegí cómo te movés', 'Bastón o andador');

    expect(find.text('450 m · 9 min caminando'), findsOneWidget);
  });

  for (final (codigo, mensaje) in [
    (
      'FUERA_DE_ZONA',
      'El destino queda fuera de la zona piloto: por ahora los recorridos se '
          'calculan solo dentro de ella',
    ),
    ('SIN_RECORRIDO', 'No hay un recorrido transitable'),
  ]) {
    testWidgets('$codigo: muestra el mensaje del servidor, sin reintentar', (
      tester,
    ) async {
      final servidor = ServidorDeRecorridos()
        ..errorRecorrido = () => errorApi(422, codigo, mensaje);
      await abrirRecorrido(tester, servidor);
      await origenEnMiUbicacion(tester);
      await destinoPorDireccion(tester);

      expect(find.text(mensaje), findsOneWidget);
      expect(find.text('Reintentar'), findsNothing);
      expect(find.byType(PolylineLayer), findsNothing);
    });
  }

  testWidgets('sin conexión deja reintentar', (tester) async {
    final servidor = ServidorDeRecorridos()
      ..errorRecorrido = () async =>
          sinConexion(RequestOptions(path: '/recorridos'));
    await abrirRecorrido(tester, servidor);
    await origenEnMiUbicacion(tester);
    await destinoPorDireccion(tester);

    servidor.errorRecorrido = null;
    await tocar(tester, find.text('Reintentar'));

    expect(find.text('650 m · 13 min caminando'), findsOneWidget);
  });

  testWidgets('sin ubicación avisa y deja elegir el origen de otra forma', (
    tester,
  ) async {
    await abrirRecorrido(
      tester,
      ServidorDeRecorridos(),
      ubicacion: UbicacionFalsa(),
    );

    await origenEnMiUbicacion(tester);

    expect(find.textContaining('No pudimos leer tu ubicación'), findsOneWidget);
    expect(find.text('Elegí desde dónde salís'), findsOneWidget);
  });

  testWidgets('marcar en el mapa muestra la zona y usa el punto elegido', (
    tester,
  ) async {
    await abrirRecorrido(tester, ServidorDeRecorridos());

    await tocar(tester, find.text('Elegí a dónde vas'));
    await tocar(tester, find.text('Marcar en el mapa'));

    expect(find.byType(PantallaElegirPunto), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'Destino'), findsOneWidget);
    expect(find.byType(PolygonLayer), findsOneWidget);
    await tocar(tester, find.text('Usar este punto'));

    expect(
      find.bySemanticsLabel('Hasta: Punto marcado en el mapa'),
      findsOneWidget,
    );
  });

  group('buscar una dirección', () {
    Future<void> buscar(WidgetTester tester, String texto) async {
      await tocar(tester, find.text('Elegí a dónde vas'));
      await tocar(tester, find.text('Buscar una dirección'));
      await tester.enterText(find.byType(TextField), texto);
      await tocar(tester, find.text('Buscar'));
    }

    testWidgets('pide al menos 3 letras sin consultar', (tester) async {
      final servidor = ServidorDeRecorridos();
      await abrirRecorrido(tester, servidor);

      await buscar(tester, 'ab');

      expect(find.text('Escribí al menos 3 letras'), findsOneWidget);
      expect(servidor.cantidad('/geocodificacion'), 0);
    });

    testWidgets('sin resultados dice qué hacer', (tester) async {
      final servidor = ServidorDeRecorridos()
        ..respuestaBusqueda = () => json(200, {'lugares': <Object>[]});
      await abrirRecorrido(tester, servidor);

      await buscar(tester, 'xyzzy');

      expect(
        find.textContaining('No encontramos ese lugar en Neuquén'),
        findsOneWidget,
      );
    });

    testWidgets('con el servicio caído muestra el mensaje del servidor', (
      tester,
    ) async {
      const mensaje =
          'No se pudo buscar la dirección porque el servicio de mapas no '
          'responde. Probá de nuevo en un rato o marcá el punto en el mapa';
      final servidor = ServidorDeRecorridos()
        ..respuestaBusqueda = () =>
            errorApi(503, 'GEOCODIFICACION_NO_DISPONIBLE', mensaje);
      await abrirRecorrido(tester, servidor);

      await buscar(tester, 'Saavedra 500');

      expect(find.text(mensaje), findsOneWidget);
    });
  });

  testWidgets('botones de 48 dp o más, con nombre para el lector de pantalla '
      'y texto con contraste', (tester) async {
    final semantica = tester.ensureSemantics();
    await abrirRecorrido(tester, ServidorDeRecorridos());
    await origenEnMiUbicacion(tester);
    await destinoPorDireccion(tester);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    semantica.dispose();
  });
}
