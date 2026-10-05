import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/red/error_api.dart';
import 'package:snapit/compartido/sesion/sesion.dart';
import 'package:snapit/compartido/sesion/usuario.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  // Acepta solo acceso-2; la renovación lo entrega.
  Future<ResponseBody> servidorQueRenueva(RequestOptions pedido) {
    if (pedido.path == '/auth/renovar') return ingresoCorrecto();
    if (pedido.headers['Authorization'] == 'Bearer acceso-2') {
      return json(200, {'usuario': usuarioJson()});
    }
    return errorApi(401, 'TOKEN_VENCIDO', 'La sesión venció');
  }

  group('al abrir la app', () {
    test(
      'sin tokens guardados no hay sesión y no consulta al servidor',
      () async {
        final servidor = ServidorFalso((_) => json(200, {}));
        final contenedor = contenedorDePrueba(servidor);

        expect(await contenedor.read(sesionProvider.future), isNull);
        expect(servidor.pedidos, isEmpty);
      },
    );

    test('con una sesión guardada pregunta quién es y entra', () async {
      guardarSesion();
      final servidor = ServidorFalso(
        (_) => json(200, {'usuario': usuarioJson()}),
      );
      final contenedor = contenedorDePrueba(servidor);

      final usuario = await contenedor.read(sesionProvider.future);

      expect(usuario?.nombre, 'Ana');
      expect(usuario?.rol, Rol.vecino);
      expect(servidor.pedidos.single.ruta, '/auth/yo');
      expect(servidor.pedidos.single.token, 'Bearer acceso-1');
    });

    test('con el acceso vencido renueva y entra sin pedir la clave', () async {
      guardarSesion();
      final servidor = ServidorFalso(servidorQueRenueva);
      final contenedor = contenedorDePrueba(servidor);

      expect(await contenedor.read(sesionProvider.future), isNotNull);
      expect(servidor.pedidos.map((p) => p.ruta), [
        '/auth/yo',
        '/auth/renovar',
        '/auth/yo',
      ]);
      expect(await tokensGuardados(), {
        'tokenAcceso': 'acceso-2',
        'tokenRenovacion': 'renovacion-2',
      });
    });

    test(
      'si la renovación se rechaza, no hay sesión y borra los tokens',
      () async {
        guardarSesion();
        final servidor = ServidorFalso((pedido) {
          if (pedido.path == '/auth/renovar') {
            return errorApi(
              401,
              'TOKEN_RENOVACION_INVALIDO',
              'La sesión venció o no es válida. Volvé a ingresar',
            );
          }
          return errorApi(401, 'TOKEN_VENCIDO', 'La sesión venció');
        });
        final contenedor = contenedorDePrueba(servidor);

        expect(await contenedor.read(sesionProvider.future), isNull);
        expect(await tokensGuardados(), isEmpty);
      },
    );

    test(
      'sin conexión da error y conserva la sesión para reintentar',
      () async {
        guardarSesion();
        final servidor = ServidorFalso(sinConexion);
        final contenedor = contenedorDePrueba(servidor);

        await expectLater(
          contenedor.read(sesionProvider.future),
          throwsA(
            isA<ErrorApi>().having((e) => e.codigo, 'codigo', 'SIN_CONEXION'),
          ),
        );
        expect(await tokensGuardados(), sesionGuardada);

        servidor.responder = (_) => json(200, {'usuario': usuarioJson()});
        contenedor.invalidate(sesionProvider);
        expect(await contenedor.read(sesionProvider.future), isNotNull);
      },
    );
  });

  group('ingresar', () {
    test('guarda los tokens y deja al usuario adentro', () async {
      final servidor = ServidorFalso((_) => ingresoCorrecto(rol: 'OPERADOR'));
      final contenedor = contenedorDePrueba(servidor);
      await contenedor.read(sesionProvider.future);

      await contenedor
          .read(sesionProvider.notifier)
          .ingresar(email: 'ana@ejemplo.com', clave: 'una-clave-segura');

      expect(contenedor.read(sesionProvider).value?.rol, Rol.operador);
      expect(servidor.pedidos.single.ruta, '/auth/ingreso');
      expect(servidor.pedidos.single.token, isNull);
      expect(servidor.pedidos.single.datos, {
        'email': 'ana@ejemplo.com',
        'clave': 'una-clave-segura',
      });
      expect(await tokensGuardados(), {
        'tokenAcceso': 'acceso-2',
        'tokenRenovacion': 'renovacion-2',
      });
    });

    test('con datos incorrectos lanza el error y no guarda nada', () async {
      final servidor = ServidorFalso(
        (_) => errorApi(
          401,
          'CREDENCIALES_INVALIDAS',
          'El correo o la clave no son correctos',
        ),
      );
      final contenedor = contenedorDePrueba(servidor);
      await contenedor.read(sesionProvider.future);

      await expectLater(
        contenedor
            .read(sesionProvider.notifier)
            .ingresar(email: 'ana@ejemplo.com', clave: 'otra'),
        throwsA(
          isA<ErrorApi>().having(
            (e) => e.codigo,
            'codigo',
            'CREDENCIALES_INVALIDAS',
          ),
        ),
      );
      expect(contenedor.read(sesionProvider).value, isNull);
      expect(servidor.cantidad('/auth/renovar'), 0);
      expect(await tokensGuardados(), isEmpty);
    });
  });

  group('salir', () {
    test('borra los tokens y avisa al servidor con el de renovación', () async {
      guardarSesion();
      final servidor = ServidorFalso((pedido) {
        if (pedido.path == '/auth/salir') return json(204, '');
        return json(200, {'usuario': usuarioJson()});
      });
      final contenedor = contenedorDePrueba(servidor);
      await contenedor.read(sesionProvider.future);

      await contenedor.read(sesionProvider.notifier).salir();
      await pumpEventQueue();

      expect(contenedor.read(sesionProvider).value, isNull);
      expect(await tokensGuardados(), isEmpty);
      final salida = servidor.pedidos.last;
      expect(salida.ruta, '/auth/salir');
      expect(salida.datos, {'tokenRenovacion': 'renovacion-1'});
      expect(salida.token, isNull);
    });

    test('sin conexión igual cierra la sesión en el teléfono', () async {
      guardarSesion();
      final servidor = ServidorFalso(
        (_) => json(200, {'usuario': usuarioJson()}),
      );
      final contenedor = contenedorDePrueba(servidor);
      await contenedor.read(sesionProvider.future);
      servidor.responder = sinConexion;

      await contenedor.read(sesionProvider.notifier).salir();
      await pumpEventQueue();

      expect(contenedor.read(sesionProvider).value, isNull);
      expect(await tokensGuardados(), isEmpty);
    });
  });

  test(
    'si la renovación se rechaza en medio del uso, la sesión se cierra',
    () async {
      guardarSesion();
      final servidor = ServidorFalso(
        (_) => json(200, {'usuario': usuarioJson()}),
      );
      final contenedor = contenedorDePrueba(servidor);
      expect(await contenedor.read(sesionProvider.future), isNotNull);

      servidor.responder = (pedido) {
        if (pedido.path == '/auth/renovar') {
          return errorApi(401, 'TOKEN_RENOVACION_INVALIDO', 'La sesión venció');
        }
        return errorApi(401, 'TOKEN_VENCIDO', 'La sesión venció');
      };
      await expectLater(
        contenedor.read(clienteApiProvider).get<Object>('/recurso'),
        throwsA(isA<DioException>()),
      );

      expect(contenedor.read(sesionProvider).value, isNull);
      expect(await tokensGuardados(), isEmpty);
    },
  );
}
