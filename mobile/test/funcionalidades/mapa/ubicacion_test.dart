import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:snapit/funcionalidades/mapa/ubicacion.dart';

/// El GPS del teléfono, con el estado que arma cada test.
class GpsFalso extends Fake implements GeolocatorPlatform {
  GpsFalso({
    this.encendido = true,
    this.permiso = LocationPermission.whileInUse,
    this.respuestaAlPedir,
    this.errorAlLeer,
  });

  final bool encendido;
  LocationPermission permiso;

  /// Lo que contesta la persona si se le pide el permiso.
  final LocationPermission? respuestaAlPedir;
  final Object? errorAlLeer;
  var permisosPedidos = 0;
  var ultimasConocidasPedidas = 0;
  final ajustesAbiertos = <String>[];

  @override
  Future<bool> isLocationServiceEnabled() async => encendido;

  @override
  Future<LocationPermission> checkPermission() async => permiso;

  @override
  Future<LocationPermission> requestPermission() async {
    permisosPedidos++;
    return permiso = respuestaAlPedir ?? permiso;
  }

  @override
  Future<Position> getCurrentPosition({
    LocationSettings? locationSettings,
  }) async {
    if (errorAlLeer case final error?) throw error;
    return posicion(-38.95, -68.05);
  }

  @override
  Future<Position?> getLastKnownPosition({
    bool forceLocationManager = false,
  }) async {
    ultimasConocidasPedidas++;
    return posicion(-38.90, -68.00);
  }

  @override
  Future<bool> openLocationSettings() async {
    ajustesAbiertos.add('ubicación');
    return true;
  }

  @override
  Future<bool> openAppSettings() async {
    ajustesAbiertos.add('app');
    return true;
  }
}

Position posicion(double lat, double lon) => Position(
  latitude: lat,
  longitude: lon,
  timestamp: DateTime.utc(2026, 10, 10),
  accuracy: 5,
  altitude: 0,
  altitudeAccuracy: 0,
  heading: 0,
  headingAccuracy: 0,
  speed: 0,
  speedAccuracy: 0,
);

Matcher lanza(ProblemaUbicacion problema) => throwsA(
  isA<ErrorUbicacion>().having((e) => e.problema, 'problema', problema),
);

void main() {
  group('paraReportar', () {
    test('con permiso devuelve la posición nueva del GPS', () async {
      final gps = GpsFalso();

      final punto = await ServicioUbicacion(gps).paraReportar();

      expect(punto, const LatLng(-38.95, -68.05));
      expect(gps.permisosPedidos, 0);
    });

    test('con la ubicación apagada no pide el permiso', () async {
      final gps = GpsFalso(
        encendido: false,
        permiso: LocationPermission.denied,
      );

      await expectLater(
        ServicioUbicacion(gps).paraReportar(),
        lanza(ProblemaUbicacion.apagada),
      );
      expect(gps.permisosPedidos, 0);
    });

    test('si el permiso no se respondió, lo pide; si lo da, sigue', () async {
      final gps = GpsFalso(
        permiso: LocationPermission.denied,
        respuestaAlPedir: LocationPermission.whileInUse,
      );

      final punto = await ServicioUbicacion(gps).paraReportar();

      expect(punto, const LatLng(-38.95, -68.05));
      expect(gps.permisosPedidos, 1);
    });

    test('si lo niega, avisa que falta el permiso', () async {
      final gps = GpsFalso(permiso: LocationPermission.denied);

      await expectLater(
        ServicioUbicacion(gps).paraReportar(),
        lanza(ProblemaUbicacion.sinPermiso),
      );
      expect(gps.permisosPedidos, 1);
    });

    test('negado para siempre: no lo vuelve a pedir', () async {
      final gps = GpsFalso(permiso: LocationPermission.deniedForever);

      await expectLater(
        ServicioUbicacion(gps).paraReportar(),
        lanza(ProblemaUbicacion.sinPermisoParaSiempre),
      );
      expect(gps.permisosPedidos, 0);
    });

    test('sin señal a tiempo no usa la última posición conocida', () async {
      final gps = GpsFalso(errorAlLeer: TimeoutException('sin señal'));

      await expectLater(
        ServicioUbicacion(gps).paraReportar(),
        lanza(ProblemaUbicacion.sinSenal),
      );
      expect(gps.ultimasConocidasPedidas, 0);
    });

    test('si se apaga mientras lee, avisa que está apagada', () async {
      final gps = GpsFalso(
        errorAlLeer: const LocationServiceDisabledException(),
      );

      await expectLater(
        ServicioUbicacion(gps).paraReportar(),
        lanza(ProblemaUbicacion.apagada),
      );
    });
  });

  test('para el mapa sí sirve la última posición conocida', () async {
    final gps = GpsFalso(errorAlLeer: TimeoutException('sin señal'));

    final punto = await ServicioUbicacion(gps).actual();

    expect(punto, const LatLng(-38.90, -68.00));
  });

  test('abre los ajustes que resuelven cada problema', () async {
    final gps = GpsFalso();
    final servicio = ServicioUbicacion(gps);

    await servicio.abrirAjustes(ProblemaUbicacion.apagada);
    await servicio.abrirAjustes(ProblemaUbicacion.sinPermisoParaSiempre);
    await servicio.abrirAjustes(ProblemaUbicacion.sinPermiso);
    await servicio.abrirAjustes(ProblemaUbicacion.sinSenal);

    expect(gps.ajustesAbiertos, ['ubicación', 'app']);
  });
}
