import 'dart:developer' as developer;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

/// En los tests se reemplaza por una ubicación fija.
final ubicacionProvider = Provider<ServicioUbicacion>(
  (ref) => const ServicioUbicacion(),
);

/// Por qué no se pudo leer la ubicación para un reporte.
enum ProblemaUbicacion {
  /// La ubicación del teléfono está desactivada.
  apagada,

  /// Se negó el permiso; se puede volver a pedir.
  sinPermiso,

  /// Se negó con «No volver a preguntar»: solo se da desde los ajustes.
  sinPermisoParaSiempre,

  /// Hay permiso, pero no llegó ninguna posición a tiempo.
  sinSenal,
}

class ErrorUbicacion implements Exception {
  const ErrorUbicacion(this.problema);

  final ProblemaUbicacion problema;

  @override
  String toString() => 'ErrorUbicacion($problema)';
}

class ServicioUbicacion {
  /// [plataforma] es para los tests; si no, se usa la del teléfono.
  const ServicioUbicacion([this._plataforma]);

  final GeolocatorPlatform? _plataforma;

  GeolocatorPlatform get _gps => _plataforma ?? GeolocatorPlatform.instance;

  /// La ubicación del teléfono, precisa o aproximada según el permiso que se
  /// dio. Pide el permiso si todavía no se respondió; si se negó, no insiste.
  /// Null si no hay permiso, la ubicación está apagada o no hay ninguna
  /// posición: el mapa se queda donde está.
  Future<LatLng?> actual() async {
    try {
      if (!await _gps.isLocationServiceEnabled()) return null;
      if (!await _hayPermiso()) return null;
      // Si no llega una posición nueva (bajo techo el GPS puede tardar), la
      // última que conoce el teléfono sirve para centrar el mapa.
      final posicion =
          await _posicionNueva() ??
          await _gps.getLastKnownPosition(forceLocationManager: true);
      return posicion == null
          ? null
          : LatLng(posicion.latitude, posicion.longitude);
    } catch (e) {
      developer.log('No se pudo leer la ubicación', name: 'mapa', error: e);
      return null;
    }
  }

  /// La ubicación para un reporte. A diferencia de [actual], nunca usa la
  /// última posición conocida: puede ser de horas atrás y de otro lugar, y
  /// es la que se va a comparar con la de la foto. Si no se puede, lanza
  /// [ErrorUbicacion] con el motivo, para decirle a la persona qué hacer.
  Future<LatLng> paraReportar() async {
    try {
      if (!await _gps.isLocationServiceEnabled()) {
        throw const ErrorUbicacion(ProblemaUbicacion.apagada);
      }
      var permiso = await _gps.checkPermission();
      if (permiso == LocationPermission.denied) {
        permiso = await _gps.requestPermission();
      }
      switch (permiso) {
        case LocationPermission.whileInUse || LocationPermission.always:
          break;
        case LocationPermission.deniedForever:
          throw const ErrorUbicacion(ProblemaUbicacion.sinPermisoParaSiempre);
        case LocationPermission.denied || LocationPermission.unableToDetermine:
          throw const ErrorUbicacion(ProblemaUbicacion.sinPermiso);
      }
      final posicion = await _gps.getCurrentPosition(
        locationSettings: _ajustes(const Duration(seconds: 20)),
      );
      return LatLng(posicion.latitude, posicion.longitude);
    } on ErrorUbicacion {
      rethrow;
    } on LocationServiceDisabledException {
      throw const ErrorUbicacion(ProblemaUbicacion.apagada);
    } catch (e) {
      // Se venció el tiempo o el GPS falló: se puede reintentar.
      developer.log('Sin posición para el reporte', name: 'reporte', error: e);
      throw const ErrorUbicacion(ProblemaUbicacion.sinSenal);
    }
  }

  /// Abre los ajustes del teléfono que resuelven [problema]: la ubicación si
  /// está apagada, los permisos de la app si se negaron para siempre.
  Future<void> abrirAjustes(ProblemaUbicacion problema) async {
    switch (problema) {
      case ProblemaUbicacion.apagada:
        await _gps.openLocationSettings();
      case ProblemaUbicacion.sinPermisoParaSiempre:
        await _gps.openAppSettings();
      case ProblemaUbicacion.sinPermiso || ProblemaUbicacion.sinSenal:
        break;
    }
  }

  Future<bool> _hayPermiso() async {
    var permiso = await _gps.checkPermission();
    if (permiso == LocationPermission.denied) {
      permiso = await _gps.requestPermission();
    }
    return permiso == LocationPermission.whileInUse ||
        permiso == LocationPermission.always;
  }

  Future<Position?> _posicionNueva() async {
    try {
      return await _gps.getCurrentPosition(
        locationSettings: _ajustes(const Duration(seconds: 10)),
      );
    } catch (e) {
      developer.log('Sin posición nueva', name: 'mapa', error: e);
      return null;
    }
  }

  // Con el proveedor de Android y no el de Google: el de Google pide además
  // activar «Precisión de la ubicación», y si la persona dice que no, no hay
  // posición aunque haya dado el permiso. Con precisión alta usa el GPS; con
  // menos depende de la ubicación por red, que justo es la que da Google.
  LocationSettings _ajustes(Duration limite) => AndroidSettings(
    accuracy: LocationAccuracy.high,
    timeLimit: limite,
    forceLocationManager: true,
  );
}
