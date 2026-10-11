import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/sesion/almacen_sesion.dart';

import '../../apoyo/servidor_falso.dart';

void main() {
  late AlmacenSesion almacen;
  late int sesionesPerdidas;

  setUp(() {
    sesionesPerdidas = 0;
    FlutterSecureStorage.setMockInitialValues({
      'tokenAcceso': 'acceso-1',
      'tokenRenovacion': 'renovacion-1',
    });
    almacen = AlmacenSesion();
  });

  Dio cliente(ServidorFalso servidor) => crearClienteApi(
    urlBase: 'http://api.test/api',
    almacen: almacen,
    alPerderSesion: () => sesionesPerdidas++,
  )..httpClientAdapter = servidor;

  // Acepta solo el token nuevo; la renovación entrega acceso-2.
  Future<ResponseBody> servidorQueRenueva(RequestOptions pedido) {
    if (pedido.path == '/auth/renovar') {
      return json(200, {
        'tokenAcceso': 'acceso-2',
        'tokenRenovacion': 'renovacion-2',
        'usuario': <String, Object>{},
      });
    }
    if (pedido.headers['Authorization'] == 'Bearer acceso-2') {
      return json(200, {'ok': true});
    }
    return errorApi(401, 'TOKEN_INVALIDO', 'El token venció');
  }

  test('agrega el token de acceso a cada petición', () async {
    final servidor = ServidorFalso((_) => json(200, {'ok': true}));

    await cliente(servidor).get<Object>('/recurso');

    expect(servidor.pedidos.single.token, 'Bearer acceso-1');
  });

  test('ante un 401 renueva una vez y reintenta con el token nuevo', () async {
    final servidor = ServidorFalso(servidorQueRenueva);

    final respuesta = await cliente(servidor).get<Object>('/recurso');

    expect(respuesta.statusCode, 200);
    expect(sesionesPerdidas, 0);
    expect(servidor.pedidos.map((p) => p.ruta), [
      '/recurso',
      '/auth/renovar',
      '/recurso',
    ]);
    final renovacion = servidor.pedidos[1];
    expect(renovacion.token, isNull);
    expect(renovacion.datos, {'tokenRenovacion': 'renovacion-1'});
    expect(servidor.pedidos.last.token, 'Bearer acceso-2');
    expect(await almacen.leerTokenAcceso(), 'acceso-2');
    expect(await almacen.leerTokenRenovacion(), 'renovacion-2');
  });

  test(
    'un formulario con archivo se reintenta igual después de renovar',
    () async {
      final servidor = ServidorFalso(servidorQueRenueva);
      final formulario = FormData.fromMap({
        'categoriaId': '3',
        'foto': MultipartFile.fromBytes([1, 2, 3], filename: 'foto.jpg'),
      });

      final respuesta = await cliente(
        servidor,
      ).post<Object>('/reportes', data: formulario);

      expect(respuesta.statusCode, 200);
      final reintento = servidor.pedidos.last.datos as FormData;
      expect(reintento, isNot(same(formulario)));
      expect(reintento.fields, formulario.fields);
      expect(reintento.files.single.value.filename, 'foto.jpg');
    },
  );

  test('si el reintento también da 401, no vuelve a renovar', () async {
    final servidor = ServidorFalso((pedido) {
      if (pedido.path == '/auth/renovar') return servidorQueRenueva(pedido);
      return errorApi(401, 'TOKEN_INVALIDO', 'El token venció');
    });

    await expectLater(
      cliente(servidor).get<Object>('/recurso'),
      throwsA(
        isA<DioException>().having(
          (e) => e.response?.statusCode,
          'status',
          401,
        ),
      ),
    );
    expect(servidor.cantidad('/auth/renovar'), 1);
    expect(servidor.cantidad('/recurso'), 2);
  });

  test('dos 401 simultáneos comparten una sola renovación', () async {
    final servidor = ServidorFalso((pedido) async {
      if (pedido.path == '/auth/renovar') {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      return servidorQueRenueva(pedido);
    });
    final dio = cliente(servidor);

    final respuestas = await Future.wait([
      dio.get<Object>('/recurso'),
      dio.get<Object>('/otro'),
    ]);

    expect(respuestas.map((r) => r.statusCode), [200, 200]);
    expect(servidor.cantidad('/auth/renovar'), 1);
  });

  test(
    'si el servidor rechaza la renovación, borra la sesión, avisa y devuelve '
    'ese error',
    () async {
      final servidor = ServidorFalso((pedido) {
        if (pedido.path == '/auth/renovar') {
          return errorApi(401, 'SESION_VENCIDA', 'La sesión venció');
        }
        return errorApi(401, 'TOKEN_INVALIDO', 'El token venció');
      });

      await expectLater(
        cliente(servidor).get<Object>('/recurso'),
        throwsA(
          isA<DioException>().having(
            (e) => e.requestOptions.path,
            'ruta',
            '/auth/renovar',
          ),
        ),
      );
      expect(await almacen.leerTokenAcceso(), isNull);
      expect(await almacen.leerTokenRenovacion(), isNull);
      expect(sesionesPerdidas, 1);
    },
  );

  test('sin conexión durante la renovación, conserva la sesión', () async {
    final servidor = ServidorFalso((pedido) {
      if (pedido.path == '/auth/renovar') sinConexion(pedido);
      return errorApi(401, 'TOKEN_INVALIDO', 'El token venció');
    });

    await expectLater(
      cliente(servidor).get<Object>('/recurso'),
      throwsA(
        isA<DioException>().having(
          (e) => e.type,
          'tipo',
          DioExceptionType.connectionError,
        ),
      ),
    );
    expect(await almacen.leerTokenAcceso(), 'acceso-1');
    expect(await almacen.leerTokenRenovacion(), 'renovacion-1');
    expect(sesionesPerdidas, 0);
  });

  test('un 403 no renueva la sesión', () async {
    final servidor = ServidorFalso(
      (_) => errorApi(403, 'SIN_PERMISO', 'No tenés permiso'),
    );

    await expectLater(
      cliente(servidor).get<Object>('/recurso'),
      throwsA(isA<DioException>()),
    );
    expect(servidor.cantidad('/auth/renovar'), 0);
  });

  test('sin sesión no manda token ni intenta renovar ante un 401', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final servidor = ServidorFalso(
      (_) => errorApi(401, 'CREDENCIALES_INVALIDAS', 'Datos incorrectos'),
    );

    await expectLater(
      cliente(servidor).post<Object>('/auth/ingreso'),
      throwsA(isA<DioException>()),
    );
    expect(servidor.pedidos.single.token, isNull);
    expect(servidor.cantidad('/auth/renovar'), 0);
  });
}
