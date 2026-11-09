import 'package:latlong2/latlong.dart';

/// Una zona habitual del vecino (`GET /zonas-habituales`).
class ZonaHabitual {
  const ZonaHabitual({
    required this.id,
    required this.nombre,
    required this.lat,
    required this.lon,
    required this.radioMetros,
    required this.activa,
  });

  factory ZonaHabitual.desdeJson(Map<String, dynamic> json) => ZonaHabitual(
    id: json['id'] as int,
    nombre: json['nombre'] as String,
    lat: (json['lat'] as num).toDouble(),
    lon: (json['lon'] as num).toDouble(),
    radioMetros: json['radioMetros'] as int,
    activa: json['activa'] as bool,
  );

  final int id;
  final String nombre;
  final double lat;
  final double lon;
  final int radioMetros;
  final bool activa;

  LatLng get centro => LatLng(lat, lon);

  DatosZona get datos => DatosZona(
    nombre: nombre,
    centro: centro,
    radioMetros: radioMetros,
    activa: activa,
  );
}

/// Lo que se manda en `POST` y `PUT /zonas-habituales`.
class DatosZona {
  const DatosZona({
    required this.nombre,
    required this.centro,
    required this.radioMetros,
    this.activa = true,
  });

  final String nombre;
  final LatLng centro;
  final int radioMetros;
  final bool activa;

  DatosZona copyWith({
    String? nombre,
    LatLng? centro,
    int? radioMetros,
    bool? activa,
  }) => DatosZona(
    nombre: nombre ?? this.nombre,
    centro: centro ?? this.centro,
    radioMetros: radioMetros ?? this.radioMetros,
    activa: activa ?? this.activa,
  );

  Map<String, Object?> toJson() => {
    'nombre': nombre,
    'lat': centro.latitude,
    'lon': centro.longitude,
    'radioMetros': radioMetros,
    'activa': activa,
  };
}

/// Una categoría prendida o apagada para los avisos.
class PreferenciaCategoria {
  const PreferenciaCategoria({
    required this.categoriaId,
    required this.habilitada,
  });

  factory PreferenciaCategoria.desdeJson(Map<String, dynamic> json) =>
      PreferenciaCategoria(
        categoriaId: json['categoriaId'] as int,
        habilitada: json['habilitada'] as bool,
      );

  final int categoriaId;
  final bool habilitada;

  PreferenciaCategoria copyWith({bool? habilitada}) => PreferenciaCategoria(
    categoriaId: categoriaId,
    habilitada: habilitada ?? this.habilitada,
  );

  Map<String, Object> toJson() => {
    'categoriaId': categoriaId,
    'habilitada': habilitada,
  };
}
