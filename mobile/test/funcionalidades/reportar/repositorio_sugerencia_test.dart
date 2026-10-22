import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/red/error_api.dart';
import 'package:snapit/compartido/sesion/almacen_sesion.dart';
import 'package:snapit/funcionalidades/reportar/borrador_reporte.dart';
import 'package:snapit/funcionalidades/reportar/repositorio_sugerencia.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  late Directory carpeta;
  late File foto;

  setUpAll(() {
    carpeta = Directory.systemTemp.createTempSync('sugerencia');
    foto = File('${carpeta.path}/pozo.jpg')
      ..writeAsBytesSync([0xFF, 0xD8, 0xFF, 1, 2, 3, 0xFF, 0xD9]);
  });

  tearDownAll(() {
    // Ver repositorio_reportes_test.dart: en Windows puede seguir abierta.
    try {
      carpeta.deleteSync(recursive: true);
    } on FileSystemException catch (_) {}
  });

  setUp(() => FlutterSecureStorage.setMockInitialValues({...sesionGuardada}));

  RepositorioSugerencia repositorio(ServidorFalso servidor) {
    final dio = crearClienteApi(
      urlBase: 'http://api.test/api',
      almacen: AlmacenSesion(),
    )..httpClientAdapter = servidor;
    return RepositorioSugerencia(dio);
  }

  test('manda la foto original y lee la sugerencia', () async {
    final servidor = ServidorFalso(
      (_) => json(200, {
        'categoriaId': 3,
        'severidad': 'GRAVE',
        'registroIaId': 41,
      }),
    );

    final sugerencia = await repositorio(servidor).pedir(foto.path);

    expect(sugerencia.categoriaId, 3);
    expect(sugerencia.severidad, Severidad.grave);
    expect(sugerencia.registroIaId, 41);
    final pedido = servidor.pedidos.single;
    expect(pedido.ruta, '/ia/clasificar-foto');
    expect(pedido.token, 'Bearer acceso-1');
    final formulario = pedido.datos as FormData;
    expect(formulario.fields, isEmpty);
    final archivo = formulario.files.single;
    expect(archivo.key, 'foto');
    final enviados = await archivo.value
        .clone()
        .finalize()
        .expand((b) => b)
        .toList();
    expect(enviados, foto.readAsBytesSync());
  });

  test('con la IA caída sale el error de la API', () async {
    final servidor = ServidorFalso(
      (_) => errorApi(503, 'IA_NO_DISPONIBLE', 'La IA no está disponible'),
    );

    await expectLater(
      repositorio(servidor).pedir(foto.path),
      throwsA(
        isA<ErrorApi>().having((e) => e.codigo, 'codigo', 'IA_NO_DISPONIBLE'),
      ),
    );
  });

  test('una respuesta que no se entiende también es un ErrorApi', () async {
    final servidor = ServidorFalso(
      (_) => json(200, {
        'categoriaId': 3,
        'severidad': 'MUY_GRAVE',
        'registroIaId': 41,
      }),
    );

    await expectLater(
      repositorio(servidor).pedir(foto.path),
      throwsA(
        isA<ErrorApi>().having((e) => e.codigo, 'codigo', 'ERROR_INESPERADO'),
      ),
    );
  });

  test('si se cancela, no sale como un error para mostrar', () async {
    final respuesta = Completer<ResponseBody>();
    final cancelar = CancelToken();
    final pedido = repositorio(
      ServidorFalso((_) => respuesta.future),
    ).pedir(foto.path, cancelar: cancelar);

    cancelar.cancel();

    await expectLater(
      pedido,
      throwsA(
        isA<DioException>().having(
          (e) => e.type,
          'type',
          DioExceptionType.cancel,
        ),
      ),
    );
  });
}
