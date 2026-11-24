import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/compartido/red/error_api.dart';
import 'package:snapit/compartido/sesion/sesion.dart';
import 'package:snapit/funcionalidades/reportar/borrador_reporte.dart';
import 'package:snapit/funcionalidades/reportar/cola_reportes.dart';
import 'package:snapit/funcionalidades/reportar/sincronizador_reportes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  // El almacenamiento seguro simulado necesita el entorno de Flutter.
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory carpeta;
  late File foto;

  setUp(() {
    guardarSesion();
    carpeta = Directory.systemTemp.createTempSync('snapit-sincronizar');
    foto = File('${carpeta.path}/bache.jpg')
      ..writeAsBytesSync([0xFF, 0xD8, 0xFF, 0xD9]);
  });
  tearDown(() => carpeta.deleteSync(recursive: true));

  /// Un reporte completo, listo para enviar.
  BorradorReporte borrador() => BorradorReporte(
    foto: FotoReporte(ruta: foto.path, tomadaConCamaraApp: true),
    categoriaId: 1,
    severidad: Severidad.moderada,
    punto: const LatLng(-38.95, -68.06),
    registradoEn: DateTime.utc(2026, 11, 23, 13, 30),
  );

  /// Con sesión de [rol] (el usuario 7) y `POST /reportes` respondiendo
  /// [alReportar].
  Future<(ProviderContainer, ServidorFalso)> preparar({
    String rol = 'VECINO',
    Future<ResponseBody> Function()? alReportar,
  }) async {
    final servidor = ServidorFalso(
      (pedido) => switch (pedido.path) {
        '/auth/yo' => json(200, {'usuario': usuarioJson(rol: rol)}),
        '/reportes' =>
          alReportar?.call() ?? json(201, {'id': 40, 'incidenteId': 12}),
        _ => json(404, {
          'error': {'codigo': 'NO_ENCONTRADO', 'mensaje': 'No existe'},
        }),
      },
    );
    final contenedor = contenedorDePrueba(servidor);
    await contenedor.read(sesionProvider.future);
    return (contenedor, servidor);
  }

  test('envía los pendientes del vecino con sesión y los saca de la cola', () async {
    final (contenedor, servidor) = await preparar();
    final cola = contenedor.read(colaReportesProvider);
    await cola.guardar(borrador(), usuarioId: 7, categoriaNombre: 'Bache');

    await contenedor.read(sincronizadorReportesProvider).sincronizar();

    expect(servidor.cantidad('/reportes'), 1);
    expect(await cola.leer(), isEmpty);
  });

  test('no envía los pendientes de otro usuario del teléfono', () async {
    final (contenedor, servidor) = await preparar();
    final cola = contenedor.read(colaReportesProvider);
    await cola.guardar(borrador(), usuarioId: 99, categoriaNombre: 'Bache');

    await contenedor.read(sincronizadorReportesProvider).sincronizar();

    expect(servidor.cantidad('/reportes'), 0);
    expect(await cola.leer(), hasLength(1));
  });

  test('con sesión de operador no envía nada', () async {
    final (contenedor, servidor) = await preparar(rol: 'OPERADOR');
    final cola = contenedor.read(colaReportesProvider);
    await cola.guardar(borrador(), usuarioId: 7, categoriaNombre: 'Bache');

    await contenedor.read(sincronizadorReportesProvider).sincronizar();

    expect(servidor.cantidad('/reportes'), 0);
  });

  test('un rechazo definitivo queda con el motivo y no se reintenta', () async {
    final (contenedor, servidor) = await preparar(
      alReportar: () => json(400, {
        'error': {
          'codigo': 'DATOS_INVALIDOS',
          'mensaje': 'Hay datos inválidos',
          'detalles': [
            {'campo': 'categoriaId', 'mensaje': 'No existe o no está activa'},
          ],
        },
      }),
    );
    final cola = contenedor.read(colaReportesProvider);
    await cola.guardar(borrador(), usuarioId: 7, categoriaNombre: 'Bache');
    final sincronizador = contenedor.read(sincronizadorReportesProvider);

    await sincronizador.sincronizar();
    await sincronizador.sincronizar();

    expect(servidor.cantidad('/reportes'), 1);
    final [pendiente] = await cola.leer();
    expect(pendiente.rechazo, 'No existe o no está activa');
  });

  test('si la foto ya no está en el teléfono, queda rechazado sin enviarse', () async {
    final (contenedor, servidor) = await preparar();
    final cola = contenedor.read(colaReportesProvider);
    await cola.guardar(borrador(), usuarioId: 7, categoriaNombre: 'Bache');
    foto.deleteSync();

    await contenedor.read(sincronizadorReportesProvider).sincronizar();

    expect(servidor.cantidad('/reportes'), 0);
    final [pendiente] = await cola.leer();
    expect(pendiente.rechazado, isTrue);
  });

  test('una falla del servidor es pasajera: se reintenta la próxima vez', () async {
    final (contenedor, servidor) = await preparar(
      alReportar: () => json(503, {
        'error': {'codigo': 'ERROR_INTERNO', 'mensaje': 'No disponible'},
      }),
    );
    final cola = contenedor.read(colaReportesProvider);
    await cola.guardar(borrador(), usuarioId: 7, categoriaNombre: 'Bache');
    final sincronizador = contenedor.read(sincronizadorReportesProvider);

    await sincronizador.sincronizar();
    await sincronizador.sincronizar();

    expect(servidor.cantidad('/reportes'), 2);
    final [pendiente] = await cola.leer();
    expect(pendiente.rechazado, isFalse);
  });

  group('esRechazoDefinitivo', () {
    ErrorApi conStatus(int? status) =>
        ErrorApi(codigo: 'X', mensaje: 'x', status: status);

    test('los datos que el servidor no acepta son definitivos', () {
      for (final status in [400, 403, 404, 409, 413, 422]) {
        expect(esRechazoDefinitivo(conStatus(status)), isTrue, reason: '$status');
      }
    });

    test('sin conexión, sesión vencida, límite o falla del servidor no', () {
      for (final status in [null, 401, 408, 429, 500, 503]) {
        expect(esRechazoDefinitivo(conStatus(status)), isFalse, reason: '$status');
      }
    });
  });
}
