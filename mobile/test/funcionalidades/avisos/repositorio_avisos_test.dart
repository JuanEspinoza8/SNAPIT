import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/red/error_api.dart';
import 'package:snapit/compartido/sesion/almacen_sesion.dart';
import 'package:snapit/funcionalidades/avisos/modelos.dart';
import 'package:snapit/funcionalidades/avisos/repositorio_avisos.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({...sesionGuardada}));

  RepositorioAvisos repositorio(ServidorFalso servidor) {
    final dio = crearClienteApi(
      urlBase: 'http://api.test/api',
      almacen: AlmacenSesion(),
    )..httpClientAdapter = servidor;
    return RepositorioAvisos(dio);
  }

  test('registra el celular con el token y la plataforma', () async {
    final servidor = ServidorFalso((_) => json(204, ''));

    await repositorio(servidor).registrarDispositivo('token-fcm');

    final pedido = servidor.pedidos.single;
    expect(pedido.ruta, '/dispositivos');
    expect(pedido.datos, {'tokenPush': 'token-fcm', 'plataforma': 'ANDROID'});
    expect(pedido.token, 'Bearer acceso-1');
  });

  test('lista los avisos en el orden que manda el servidor', () async {
    final servidor = ServidorFalso(
      (_) => json(200, {
        'notificaciones': [
          {
            'id': 31,
            'tipo': 'CAMBIO_ESTADO',
            'incidenteId': 9,
            'titulo': 'Tu reporte avanzó',
            'cuerpo': 'El pozo pasó a En ejecución',
            'creadoEn': '2026-11-04T13:10:00.000Z',
            'enviadaEn': '2026-11-04T13:10:01.000Z',
            'leidaEn': null,
          },
          {
            'id': 30,
            'tipo': 'CIERRE',
            'incidenteId': null,
            'titulo': 'Incidente cerrado',
            'cuerpo': 'El incidente se cerró',
            'creadoEn': '2026-11-03T10:00:00.000Z',
            'enviadaEn': null,
            'leidaEn': '2026-11-03T10:05:00.000Z',
          },
        ],
      }),
    );

    final avisos = await repositorio(servidor).listar();

    expect(avisos.map((aviso) => aviso.id), [31, 30]);
    expect(avisos.first.tipo, TipoAviso.cambioEstado);
    expect(avisos.first.leida, isFalse);
    expect(avisos.last.tipo, TipoAviso.cierre);
    expect(avisos.last.leida, isTrue);
    expect(servidor.pedidos.single.ruta, '/notificaciones');
  });

  test('marca un aviso como leído', () async {
    final servidor = ServidorFalso((_) => json(204, ''));

    await repositorio(servidor).marcarLeida(31);

    final pedido = servidor.pedidos.single;
    expect(pedido.ruta, '/notificaciones/31/leida');
    expect(pedido.token, 'Bearer acceso-1');
  });

  test('sin conexión avisa con un mensaje claro', () async {
    final servidor = ServidorFalso(sinConexion);

    await expectLater(
      repositorio(servidor).listar(),
      throwsA(
        isA<ErrorApi>().having((e) => e.codigo, 'codigo', 'SIN_CONEXION'),
      ),
    );
  });
}
