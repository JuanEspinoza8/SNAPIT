import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/foto/ubicacion_foto.dart';

/// Un JPEG mínimo con un EXIF que solo trae la ubicación, armado byte por
/// byte como en la web (web/test/jpegConGps.ts): SOI, APP1 «Exif» con el
/// bloque TIFF (IFD0 con el puntero al GPS, y el GPS con las referencias y
/// los grados, minutos y segundos) y EOI. [refLat] y [refLon] cambian la
/// letra del hemisferio; con [conRefs] en false, el GPS no las trae.
Uint8List jpegConGps(
  double lat,
  double lon, {
  bool intel = false,
  String? refLat,
  String? refLon,
  bool conRefs = true,
}) {
  List<int> u16(int valor) => intel
      ? [valor & 0xff, (valor >> 8) & 0xff]
      : [(valor >> 8) & 0xff, valor & 0xff];
  List<int> u32(int valor) {
    final bytes = [
      (valor >> 24) & 0xff,
      (valor >> 16) & 0xff,
      (valor >> 8) & 0xff,
      valor & 0xff,
    ];
    return intel ? bytes.reversed.toList() : bytes;
  }

  List<int> fracciones(double grados) {
    final absoluto = grados.abs();
    final enteros = absoluto.floor();
    final minutos = ((absoluto - enteros) * 60).floor();
    final centesimas = (((absoluto - enteros) * 60 - minutos) * 6000).round();
    return [
      ...u32(enteros), ...u32(1), //
      ...u32(minutos), ...u32(1), //
      ...u32(centesimas), ...u32(100),
    ];
  }

  List<int> ref(String letra) => [letra.codeUnitAt(0), 0, 0, 0];
  // Sin referencias, sus entradas pasan a ser otras etiquetas del GPS (la
  // fecha y el método): así no cambia ningún desplazamiento.
  final (etiquetaRefLat, etiquetaRefLon) = conRefs ? (1, 3) : (0x1d, 0x1b);
  final tiff = [
    ...(intel ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
    // IFD0 (en 8): el puntero al IFD del GPS, que empieza en 26.
    ...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(26), ...u32(0),
    // IFD del GPS (en 26): las fracciones van en 80 y en 104.
    ...u16(4),
    ...u16(etiquetaRefLat), ...u16(2), ...u32(2),
    ...ref(refLat ?? (lat < 0 ? 'S' : 'N')),
    ...u16(2), ...u16(5), ...u32(3), ...u32(80),
    ...u16(etiquetaRefLon), ...u16(2), ...u32(2),
    ...ref(refLon ?? (lon < 0 ? 'W' : 'E')),
    ...u16(4), ...u16(5), ...u32(3), ...u32(104),
    ...u32(0),
    ...fracciones(lat), ...fracciones(lon),
  ];
  final app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  final largo = app1.length + 2;
  return Uint8List.fromList([
    0xff, 0xd8, 0xff, 0xe1, (largo >> 8) & 0xff, largo & 0xff, //
    ...app1,
    0xff, 0xd9,
  ]);
}

void main() {
  test('lee la latitud y la longitud con el signo de su referencia', () {
    final punto = leerUbicacion(jpegConGps(-38.951667, -68.059167));

    expect(punto?.latitude, closeTo(-38.951667, 1e-4));
    expect(punto?.longitude, closeTo(-68.059167, 1e-4));
  });

  test('lee el EXIF en cualquiera de los dos órdenes de bytes', () {
    final punto = leerUbicacion(jpegConGps(40.4168, 3.7038, intel: true));

    expect(punto?.latitude, closeTo(40.4168, 1e-4));
    expect(punto?.longitude, closeTo(3.7038, 1e-4));
  });

  test('sin el hemisferio no hay ubicación: no se supone norte ni este', () {
    expect(leerUbicacion(jpegConGps(38.951667, 68.059167)), isNotNull);

    expect(
      leerUbicacion(jpegConGps(38.951667, 68.059167, conRefs: false)),
      isNull,
    );
  });

  test('con un hemisferio que no es N/S o E/W no hay ubicación', () {
    expect(
      leerUbicacion(jpegConGps(-38.951667, -68.059167, refLat: 'X')),
      isNull,
    );
    // Las letras cambiadas: E en la latitud, N en la longitud.
    expect(
      leerUbicacion(jpegConGps(-38.951667, -68.059167, refLat: 'E')),
      isNull,
    );
    expect(
      leerUbicacion(jpegConGps(-38.951667, -68.059167, refLon: 'N')),
      isNull,
    );
  });

  test('acepta el hemisferio en minúscula, como el servidor', () {
    final punto = leerUbicacion(
      jpegConGps(-38.951667, -68.059167, refLat: 's', refLon: 'w'),
    );

    expect(punto?.latitude, closeTo(-38.951667, 1e-4));
    expect(punto?.longitude, closeTo(-68.059167, 1e-4));
  });

  test('sin EXIF, con 0, 0, cortado o si no es un JPEG, no hay ubicación', () {
    expect(leerUbicacion(Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9])), isNull);
    expect(leerUbicacion(jpegConGps(0, 0)), isNull);
    expect(
      leerUbicacion(Uint8List.fromList([0xff, 0xd8, 0xff, 0xe1, 0x00])),
      isNull,
    );
    expect(leerUbicacion(Uint8List.fromList([0x89, 0x50, 0x4e, 0x47])), isNull);
  });
}
