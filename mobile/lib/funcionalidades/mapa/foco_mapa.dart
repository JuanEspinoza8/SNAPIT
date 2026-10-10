import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

/// Un punto que otra pantalla le pide mostrar al mapa, por ejemplo el de un
/// reporte recién enviado. El mapa lo consume y lo vuelve a null.
final focoMapaProvider = NotifierProvider<FocoMapa, LatLng?>(FocoMapa.new);

class FocoMapa extends Notifier<LatLng?> {
  @override
  LatLng? build() => null;

  void enfocar(LatLng punto) => state = punto;

  void limpiar() => state = null;
}
