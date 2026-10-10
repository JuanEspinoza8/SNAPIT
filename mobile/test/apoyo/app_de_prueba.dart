import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/app.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/funcionalidades/mapa/ubicacion.dart';

import 'servidor_falso.dart';

/// Tokens de una sesión abierta en una ejecución anterior de la app.
const sesionGuardada = {
  'tokenAcceso': 'acceso-1',
  'tokenRenovacion': 'renovacion-1',
};

/// Deja [sesionGuardada] en el almacenamiento seguro simulado. Se copia
/// porque el simulador modifica el mapa que recibe.
void guardarSesion() =>
    FlutterSecureStorage.setMockInitialValues({...sesionGuardada});

Map<String, Object?> usuarioJson({String rol = 'VECINO'}) => {
  'id': 7,
  'email': 'ana@ejemplo.com',
  'nombre': 'Ana',
  'rol': rol,
  'organismoId': rol == 'VECINO' ? null : 1,
  'areaId': rol == 'OPERADOR' ? 3 : null,
};

Future<ResponseBody> ingresoCorrecto({String rol = 'VECINO'}) => json(200, {
  'tokenAcceso': 'acceso-2',
  'tokenRenovacion': 'renovacion-2',
  'usuario': usuarioJson(rol: rol),
});

/// Ubicación del teléfono fija. Null: sin permiso.
class UbicacionFalsa implements ServicioUbicacion {
  UbicacionFalsa([this.posicion]);

  final LatLng? posicion;
  var pedidos = 0;

  @override
  Future<LatLng?> actual() async {
    pedidos++;
    return posicion;
  }
}

/// Los providers reales de la app; solo la red se reemplaza por [servidor] y
/// la ubicación por [ubicacion] (por defecto, sin permiso).
ProviderContainer contenedorDePrueba(
  ServidorFalso servidor, {
  ServicioUbicacion? ubicacion,
}) {
  final contenedor = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      ubicacionProvider.overrideWithValue(ubicacion ?? UbicacionFalsa()),
    ],
  );
  addTearDown(contenedor.dispose);
  contenedor.read(clienteApiProvider).httpClientAdapter = servidor;
  return contenedor;
}

/// Abre la app como si fuera la primera vez, con lo que haya en el
/// almacenamiento seguro (`FlutterSecureStorage.setMockInitialValues`).
Future<ProviderContainer> abrirApp(
  WidgetTester tester,
  ServidorFalso servidor, {
  ServicioUbicacion? ubicacion,
}) async {
  final contenedor = contenedorDePrueba(servidor, ubicacion: ubicacion);
  await tester.pumpWidget(
    UncontrolledProviderScope(container: contenedor, child: const AppSnapIt()),
  );
  await tester.pumpAndSettle();
  return contenedor;
}

Future<Map<String, String>> tokensGuardados() =>
    const FlutterSecureStorage().readAll();
