import 'dart:developer' as developer;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

/// En los tests se reemplaza por una ubicación fija.
final ubicacionProvider = Provider<ServicioUbicacion>(
  (ref) => const ServicioUbicacion(),
);

class ServicioUbicacion {
  const ServicioUbicacion();

  /// La ubicación del teléfono, precisa o aproximada según el permiso que se
  /// dio. Pide el permiso si todavía no se respondió; si se negó, no insiste.
  /// Null si no hay permiso, la ubicación está apagada o no hay ninguna
  /// posición: el mapa se queda donde está.
  Future<LatLng?> actual() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permiso = await Geolocator.checkPermission();
      if (permiso == LocationPermission.denied) {
        permiso = await Geolocator.requestPermission();
      }
      if (permiso != LocationPermission.whileInUse &&
          permiso != LocationPermission.always) {
        return null;
      }
      // Si no llega una posición nueva (bajo techo el GPS puede tardar), la
      // última que conoce el teléfono sirve para centrar el mapa.
      final posicion =
          await _posicionNueva() ??
          await Geolocator.getLastKnownPosition(
            forceAndroidLocationManager: true,
          );
      return posicion == null
          ? null
          : LatLng(posicion.latitude, posicion.longitude);
    } catch (e) {
      developer.log('No se pudo leer la ubicación', name: 'mapa', error: e);
      return null;
    }
  }

  Future<Position?> _posicionNueva() async {
    try {
      return await Geolocator.getCurrentPosition(
        // Con el proveedor de Android y no el de Google: el de Google pide
        // además activar «Precisión de la ubicación», y si la persona dice
        // que no, el mapa no se centra aunque haya dado el permiso. Con
        // precisión alta usa el GPS; con menos depende de la ubicación por
        // red, que justo es la que da Google.
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 10),
          forceLocationManager: true,
        ),
      );
    } catch (e) {
      developer.log('Sin posición nueva', name: 'mapa', error: e);
      return null;
    }
  }
}
