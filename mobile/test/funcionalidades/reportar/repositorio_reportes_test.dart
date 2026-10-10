import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/red/error_api.dart';
import 'package:snapit/compartido/sesion/almacen_sesion.dart';
import 'package:snapit/funcionalidades/reportar/borrador_reporte.dart';
import 'package:snapit/funcionalidades/reportar/repositorio_reportes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  late Directory carpeta;
  late File foto;
  late BorradorReporte borrador;

  setUpAll(() {
    carpeta = Directory.systemTemp.createTempSync('reporte');
    // Bytes cualesquiera: lo que importa es que lleguen sin cambios.
    foto = File('${carpeta.path}/pozo.jpg')
      ..writeAsBytesSync([0xFF, 0xD8, 0xFF, 1, 2, 3, 0xFF, 0xD9]);
  });

  tearDownAll(() {
    // dio empieza a leer la foto aunque el servidor falso no la consuma, y en
    // Windows un archivo abierto no se puede borrar. Si pasa, queda en la
    // carpeta temporal del sistema.
    try {
      carpeta.deleteSync(recursive: true);
    } on FileSystemException catch (_) {}
  });

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({...sesionGuardada});
    borrador = BorradorReporte(
      foto: FotoReporte(ruta: foto.path, tomadaConCamaraApp: true),
      categoriaId: 3,
      severidad: Severidad.moderada,
      punto: const LatLng(-38.95, -68.05),
      registradoEn: DateTime.utc(2026, 10, 10, 17, 30),
    );
  });

  RepositorioReportesApi repositorio(ServidorFalso servidor) {
    final dio = crearClienteApi(
      urlBase: 'http://api.test/api',
      almacen: AlmacenSesion(),
    )..httpClientAdapter = servidor;
    return RepositorioReportesApi(dio);
  }

  test('manda el multipart con los campos del borrador y la foto', () async {
    final servidor = ServidorFalso(
      (_) => json(201, {
        'id': 15,
        'incidenteId': 9,
        'nivelConfianza': 0,
        'estadoVerificacion': 'PENDIENTE_REVISION',
      }),
    );

    final enviado = await repositorio(servidor).enviar(borrador);

    expect(enviado.id, 15);
    expect(enviado.incidenteId, 9);
    final pedido = servidor.pedidos.single;
    expect(pedido.ruta, '/reportes');
    expect(pedido.token, 'Bearer acceso-1');
    final formulario = pedido.datos as FormData;
    expect(Map.fromEntries(formulario.fields), borrador.campos());
    final archivo = formulario.files.single;
    expect(archivo.key, 'foto');
    expect(archivo.value.filename, 'pozo.jpg');
    // El archivo sale tal cual está en el teléfono, sin recomprimir.
    final enviados = await archivo.value
        .clone()
        .finalize()
        .expand((b) => b)
        .toList();
    expect(enviados, foto.readAsBytesSync());
  });

  test('un 400 llega con los detalles de cada campo', () async {
    final servidor = ServidorFalso(
      (_) => json(400, {
        'error': {
          'codigo': 'DATOS_INVALIDOS',
          'mensaje': 'Hay datos inválidos',
          'detalles': [
            {'campo': 'categoriaId', 'mensaje': 'No existe o no está activa'},
          ],
        },
      }),
    );

    await expectLater(
      repositorio(servidor).enviar(borrador),
      throwsA(
        isA<ErrorApi>()
            .having((e) => e.codigo, 'codigo', 'DATOS_INVALIDOS')
            .having((e) => e.detalles.single.campo, 'campo', 'categoriaId'),
      ),
    );
  });

  test('sin conexión avisa con un mensaje claro', () async {
    final servidor = ServidorFalso(sinConexion);

    await expectLater(
      repositorio(servidor).enviar(borrador),
      throwsA(
        isA<ErrorApi>().having((e) => e.codigo, 'codigo', 'SIN_CONEXION'),
      ),
    );
  });

  test(
    'si la foto ya no está en el teléfono, lo dice sin llamar al servidor',
    () async {
      final servidor = ServidorFalso((_) => json(201, <String, Object>{}));
      final sinFoto = borrador.copyWith(
        foto: FotoReporte(
          ruta: '${carpeta.path}/borrada.jpg',
          tomadaConCamaraApp: true,
        ),
      );

      await expectLater(
        repositorio(servidor).enviar(sinFoto),
        throwsA(
          isA<ErrorApi>()
              .having((e) => e.codigo, 'codigo', 'FOTO_NO_DISPONIBLE')
              .having((e) => e.detalles.single.campo, 'campo', 'foto'),
        ),
      );
      expect(servidor.pedidos, isEmpty);
    },
  );
}
