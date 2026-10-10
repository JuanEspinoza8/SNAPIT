import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/red/error_api.dart';
import 'package:snapit/compartido/sesion/almacen_sesion.dart';
import 'package:snapit/funcionalidades/mis_reportes/repositorio_mis_reportes.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/reportes_mios.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({...sesionGuardada}));

  RepositorioMisReportes repositorio(ServidorFalso servidor) {
    final dio = crearClienteApi(
      urlBase: 'http://api.test/api',
      almacen: AlmacenSesion(),
    )..httpClientAdapter = servidor;
    return RepositorioMisReportes(dio);
  }

  test('pide la lista con la sesión y respeta el orden del servidor', () async {
    final servidor = ServidorFalso(
      (_) => json(200, {
        'reportes': [reporteJson(id: 16), reporteJson(id: 15)],
      }),
    );

    final reportes = await repositorio(servidor).mios();

    expect(reportes.map((r) => r.id), [16, 15]);
    final pedido = servidor.pedidos.single;
    expect(pedido.ruta, '/reportes/mios');
    expect(pedido.token, 'Bearer acceso-1');
  });

  test('sin reportes devuelve una lista vacía', () async {
    final servidor = ServidorFalso((_) => json(200, {'reportes': <Object>[]}));

    expect(await repositorio(servidor).mios(), isEmpty);
  });

  test('sin conexión avisa con un mensaje claro', () async {
    final servidor = ServidorFalso(sinConexion);

    await expectLater(
      repositorio(servidor).mios(),
      throwsA(
        isA<ErrorApi>().having((e) => e.codigo, 'codigo', 'SIN_CONEXION'),
      ),
    );
  });

  test('una respuesta que no se entiende también sale como ErrorApi', () async {
    final servidor = ServidorFalso(
      (_) => json(200, {
        'reportes': [reporteJson(estadoVerificacion: 'OTRO')],
      }),
    );

    await expectLater(repositorio(servidor).mios(), throwsA(isA<ErrorApi>()));
  });
}
