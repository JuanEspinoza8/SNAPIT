import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

/// Lee dónde se sacó la foto que está en [ruta]. Es un provider para que los
/// tests lo reemplacen sin archivos de verdad.
final lectorUbicacionFotoProvider = Provider<Future<LatLng?> Function(String)>(
  (ref) => ubicacionDeLaFoto,
);

// El EXIF va al principio del JPEG: alcanza con leer el comienzo del
// archivo, no la foto entera.
const _bytesALeer = 256 * 1024;

/// Dónde se sacó la foto, según su EXIF: con eso el reporte marca el punto
/// solo. Null si no es un JPEG, si no trae ubicación o si no se puede leer:
/// entonces queda el punto del GPS.
Future<LatLng?> ubicacionDeLaFoto(String ruta) async {
  try {
    final bytes = <int>[];
    await for (final parte in File(ruta).openRead(0, _bytesALeer)) {
      bytes.addAll(parte);
    }
    return leerUbicacion(Uint8List.fromList(bytes));
  } catch (_) {
    return null;
  }
}

const _soi = 0xffd8; // comienzo de un JPEG
const _app1 = 0xffe1; // donde va el EXIF
const _sos = 0xffda; // comienza la imagen: ya no hay más metadatos
const _exif = 0x45786966; // «Exif»
const _gpsIfd = 0x8825;

/// La ubicación del EXIF de un JPEG, recorriendo sus segmentos hasta el APP1
/// «Exif». Lo mismo que hace la web (web/src/compartido/ubicacionFoto.ts).
LatLng? leerUbicacion(Uint8List bytes) {
  try {
    final datos = ByteData.sublistView(bytes);
    if (datos.lengthInBytes < 4 || datos.getUint16(0) != _soi) return null;
    var posicion = 2;
    while (posicion + 4 <= datos.lengthInBytes) {
      final marca = datos.getUint16(posicion);
      if (marca >> 8 != 0xff || marca == _sos) return null;
      final largo = datos.getUint16(posicion + 2);
      if (marca == _app1 && datos.getUint32(posicion + 4) == _exif) {
        return _gpsDelTiff(datos, posicion + 10);
      }
      posicion += 2 + largo;
    }
    return null;
  } on RangeError {
    // Un EXIF cortado o mal armado: como si no trajera ubicación.
    return null;
  }
}

/// El bloque TIFF del EXIF: su IFD0 apunta al IFD del GPS, que tiene la
/// latitud y la longitud.
LatLng? _gpsDelTiff(ByteData datos, int inicio) {
  final orden = datos.getUint16(inicio);
  if (orden != 0x4949 && orden != 0x4d4d) return null;
  // «II»: los números van al revés (little endian).
  final endian = orden == 0x4949 ? Endian.little : Endian.big;
  int u16(int desde) => datos.getUint16(inicio + desde, endian);
  int u32(int desde) => datos.getUint32(inicio + desde, endian);
  if (u16(2) != 42) return null;

  // Cada entrada de un IFD ocupa 12 bytes; el valor va 8 bytes después.
  Map<int, int> entradas(int ifd) => {
    for (var i = 0; i < u16(ifd); i++) u16(ifd + 2 + i * 12): ifd + 2 + i * 12,
  };
  final gps = entradas(u32(4))[_gpsIfd];
  if (gps == null) return null;
  final delGps = entradas(u32(gps + 8));

  // La referencia (N/S, E/O) es un texto de un carácter, dentro de la entrada.
  String? referencia(int etiqueta) => switch (delGps[etiqueta]) {
    final en? => String.fromCharCode(datos.getUint8(inicio + en + 8)),
    null => null,
  };
  // Grados, minutos y segundos: tres fracciones guardadas afuera.
  double? grados(int etiqueta) {
    final en = delGps[etiqueta];
    if (en == null) return null;
    final desde = u32(en + 8);
    double fraccion(int i) => u32(desde + i * 8) / u32(desde + i * 8 + 4);
    return fraccion(0) + fraccion(1) / 60 + fraccion(2) / 3600;
  }

  final lat = grados(2);
  final lon = grados(4);
  if (lat == null || lon == null) return null;
  final latitud = referencia(1) == 'S' ? -lat : lat;
  final longitud = referencia(3) == 'W' ? -lon : lon;
  // Un GPS sin señal a veces graba 0, 0: no es un lugar.
  final valido =
      latitud.isFinite &&
      longitud.isFinite &&
      latitud.abs() <= 90 &&
      longitud.abs() <= 180 &&
      !(latitud == 0 && longitud == 0);
  return valido ? LatLng(latitud, longitud) : null;
}
