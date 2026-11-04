import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/compartido/red/error_api.dart';
import 'package:snapit/compartido/sesion/almacen_sesion.dart';
import 'package:snapit/funcionalidades/recorrido/repositorio_recorrido.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/recorrido.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({...sesionGuardada}));

  RepositorioRecorrido repositorio(ServidorFalso servidor) {
    final dio = crearClienteApi(
      urlBase: 'http://api.test/api',
      almacen: AlmacenSesion(),
    )..httpClientAdapter = servidor;
    return RepositorioRecorrido(dio);
  }

  test(
    'pide el recorrido con la sesión, los puntos como lat,lon y el perfil',
    () async {
      final servidor = ServidorFalso(
        (_) => json(200, recorridoJson(metros: 450)),
      );

      final recorrido = await repositorio(
        servidor,
      ).recorrido((origen: origenEnZona, destino: destinoEnZona, perfilId: 2));

      expect(recorrido.distanciaMetros, 450);
      final pedido = servidor.pedidos.single;
      expect(pedido.ruta, '/recorridos');
      expect(pedido.token, 'Bearer acceso-1');
      expect(pedido.consulta, {
        'origen': '-38.958400,-68.085900',
        'destino': '-38.960100,-68.089700',
        'perfilId': '2',
      });
    },
  );

  test('sin camino devuelve el error del servidor con su mensaje', () async {
    final servidor = ServidorFalso(
      (_) => errorApi(422, 'SIN_RECORRIDO', 'No hay un recorrido transitable'),
    );

    await expectLater(
      repositorio(
        servidor,
      ).recorrido((origen: origenEnZona, destino: destinoEnZona, perfilId: 1)),
      throwsA(
        isA<ErrorApi>()
            .having((e) => e.status, 'status', 422)
            .having(
              (e) => e.mensaje,
              'mensaje',
              'No hay un recorrido transitable',
            ),
      ),
    );
  });

  test('la zona piloto y los perfiles se piden sin sesión', () async {
    final servidor = ServidorFalso(
      (pedido) => json(
        200,
        pedido.path == '/zona-piloto' ? zonaPilotoJson : perfilesJson,
      ),
    );
    final repo = repositorio(servidor);

    final zonas = await repo.zonasPiloto();
    final perfiles = await repo.perfiles();

    expect(zonas.single.nombre, 'Bouquet Roldán y La Sirena');
    expect(perfiles.map((p) => p.nombre), [
      'Silla de ruedas',
      'Bastón o andador',
    ]);
    expect(servidor.pedidos.map((p) => p.token), [null, null]);
  });

  test('busca direcciones con la sesión y lee los lugares', () async {
    final servidor = ServidorFalso((_) => json(200, lugaresJson));

    final lugares = await repositorio(servidor).buscarLugares('Saavedra 500');

    expect(lugares.single.nombre, 'Cornelio Saavedra 500, La Sirena');
    expect(lugares.single.punto, destinoEnZona);
    final pedido = servidor.pedidos.single;
    expect(pedido.ruta, '/geocodificacion');
    expect(pedido.consulta, {'texto': 'Saavedra 500'});
    expect(pedido.token, 'Bearer acceso-1');
  });

  test('sin conexión es un ErrorApi SIN_CONEXION', () async {
    final servidor = ServidorFalso((pedido) async => sinConexion(pedido));

    await expectLater(
      repositorio(servidor).buscarLugares('Saavedra 500'),
      throwsA(
        isA<ErrorApi>().having((e) => e.codigo, 'codigo', 'SIN_CONEXION'),
      ),
    );
  });
}
