import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/app.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/funcionalidades/mapa/ubicacion.dart';
import 'package:snapit/funcionalidades/reportar/selector_foto.dart';

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
  UbicacionFalsa([this.posicion, this.problema = ProblemaUbicacion.sinPermiso]);

  /// Se puede cambiar en medio de un test, por ejemplo después de «dar» el
  /// permiso.
  LatLng? posicion;

  /// Lo que responde [paraReportar] cuando no hay [posicion].
  ProblemaUbicacion problema;
  var pedidos = 0;
  var pedidosParaReportar = 0;
  final ajustesAbiertos = <ProblemaUbicacion>[];

  @override
  Future<LatLng?> actual() async {
    pedidos++;
    return posicion;
  }

  @override
  Future<LatLng> paraReportar() async {
    pedidosParaReportar++;
    return posicion ?? (throw ErrorUbicacion(problema));
  }

  @override
  Future<void> abrirAjustes(ProblemaUbicacion problema) async {
    ajustesAbiertos.add(problema);
  }
}

/// Devuelve siempre [ruta], o lanza [error] si no es null.
class SelectorFotoFalso implements SelectorFoto {
  SelectorFotoFalso(this.ruta);

  final String ruta;
  ErrorFoto? error;
  final fuentes = <FuenteFoto>[];

  @override
  Future<String?> elegir(FuenteFoto fuente) async {
    fuentes.add(fuente);
    if (error case final error?) throw error;
    return ruta;
  }
}

/// Los providers reales de la app; solo la red se reemplaza por [servidor],
/// la ubicación por [ubicacion] (por defecto, sin permiso) y, si se pasa, la
/// cámara y la galería por [selectorFoto].
ProviderContainer contenedorDePrueba(
  ServidorFalso servidor, {
  ServicioUbicacion? ubicacion,
  SelectorFoto? selectorFoto,
}) {
  final contenedor = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      ubicacionProvider.overrideWithValue(ubicacion ?? UbicacionFalsa()),
      if (selectorFoto != null)
        selectorFotoProvider.overrideWithValue(selectorFoto),
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
  SelectorFoto? selectorFoto,
}) async {
  final contenedor = contenedorDePrueba(
    servidor,
    ubicacion: ubicacion,
    selectorFoto: selectorFoto,
  );
  await tester.pumpWidget(
    UncontrolledProviderScope(container: contenedor, child: const AppSnapIt()),
  );
  await tester.pumpAndSettle();
  return contenedor;
}

Future<Map<String, String>> tokensGuardados() =>
    const FlutterSecureStorage().readAll();
