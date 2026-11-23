import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/app.dart';
import 'package:snapit/compartido/foto/ubicacion_foto.dart';
import 'package:snapit/compartido/red/cliente_api.dart';
import 'package:snapit/funcionalidades/avisos/servicio_push.dart';
import 'package:snapit/funcionalidades/mapa/ubicacion.dart';
import 'package:snapit/funcionalidades/reportar/borrador_reporte.dart';
import 'package:snapit/funcionalidades/reportar/cola_reportes.dart';
import 'package:snapit/funcionalidades/reportar/repositorio_reportes.dart';
import 'package:snapit/funcionalidades/reportar/selector_foto.dart';
import 'package:snapit/funcionalidades/reportar/sincronizador_reportes.dart';

import 'push_falso.dart';
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

Map<String, Object?> usuarioJson({
  String rol = 'VECINO',
  int? perfilMovilidadId,
  bool notificacionesHabilitadas = true,
}) => {
  'id': 7,
  'email': 'ana@ejemplo.com',
  'nombre': 'Ana',
  'rol': rol,
  'organismoId': rol == 'VECINO' ? null : 1,
  'areaId': rol == 'OPERADOR' ? 3 : null,
  'perfilMovilidadId': perfilMovilidadId,
  'notificacionesHabilitadas': notificacionesHabilitadas,
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
/// cámara y la galería por [selectorFoto]. Los avisos push usan
/// [servicioPush] (por defecto, uno falso que no pide permiso). La ubicación
/// que trae cada foto la da [ubicacionFoto] (por defecto, ninguna), o
/// [lectorUbicacionFoto] si cambia de una foto a otra: así no se leen
/// archivos de verdad.
ProviderContainer contenedorDePrueba(
  ServidorFalso servidor, {
  ServicioUbicacion? ubicacion,
  SelectorFoto? selectorFoto,
  ServicioPushFalso? servicioPush,
  LatLng? ubicacionFoto,
  Future<LatLng?> Function(String ruta)? lectorUbicacionFoto,
}) {
  final push = servicioPush ?? ServicioPushFalso();
  final contenedor = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      ubicacionProvider.overrideWithValue(ubicacion ?? UbicacionFalsa()),
      servicioPushProvider.overrideWith((ref) {
        ref.onDispose(push.cerrar);
        return push;
      }),
      if (selectorFoto != null)
        selectorFotoProvider.overrideWithValue(selectorFoto),
      colaReportesProvider.overrideWith((ref) => ColaReportesFalsa()),
      sincronizadorReportesProvider.overrideWith(
        (ref) => SincronizadorReportes(
          ref.read(repositorioReportesApiProvider),
          ref.read(colaReportesProvider),
          ConectividadFalsa(),
          ref,
        ),
      ),
      lectorUbicacionFotoProvider.overrideWithValue(
        lectorUbicacionFoto ?? (_) async => ubicacionFoto,
      ),
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
  ServicioPushFalso? servicioPush,
  LatLng? ubicacionFoto,
  Future<LatLng?> Function(String ruta)? lectorUbicacionFoto,
}) async {
  final contenedor = contenedorDePrueba(
    servidor,
    ubicacion: ubicacion,
    selectorFoto: selectorFoto,
    servicioPush: servicioPush,
    ubicacionFoto: ubicacionFoto,
    lectorUbicacionFoto: lectorUbicacionFoto,
  );
  await tester.pumpWidget(
    UncontrolledProviderScope(container: contenedor, child: const AppSnapIt()),
  );
  await tester.pumpAndSettle();
  return contenedor;
}

Future<Map<String, String>> tokensGuardados() =>
    const FlutterSecureStorage().readAll();

class ConectividadFalsa implements ServicioConectividad {
  @override
  Stream<List<ConnectivityResult>> get onConnectivityChanged =>
      const Stream<List<ConnectivityResult>>.empty();
}

class ColaReportesFalsa extends ColaReportes {
  final _pendientes = <ReportePendiente>[];

  @override
  Future<List<ReportePendiente>> leer() async => List.unmodifiable(_pendientes);

  @override
  Future<ReportePendiente> guardar(
    BorradorReporte borrador, {
    required String categoriaNombre,
  }) async {
    final pendiente = ReportePendiente(
      id: '${_pendientes.length + 1}',
      categoriaNombre: categoriaNombre,
      borrador: borrador,
    );
    _pendientes.add(pendiente);
    return pendiente;
  }

  @override
  Future<void> quitar(String id) async {
    _pendientes.removeWhere((pendiente) => pendiente.id == id);
  }
}
