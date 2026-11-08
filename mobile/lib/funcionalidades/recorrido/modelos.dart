import 'package:latlong2/latlong.dart';

// Formas que devuelve la API (docs/api.md, secciones «Zona piloto»,
// «Recorridos» y «Geocodificación»). GeoJSON guarda cada punto como
// [longitud, latitud], al revés que LatLng.

LatLng _desdeGeoJson(List<dynamic> coordenada) => LatLng(
  (coordenada[1] as num).toDouble(),
  (coordenada[0] as num).toDouble(),
);

/// Una forma de moverse (`GET /perfiles-movilidad`).
class PerfilMovilidad {
  const PerfilMovilidad({required this.id, required this.nombre});

  factory PerfilMovilidad.desdeJson(Map<String, dynamic> json) =>
      PerfilMovilidad(id: json['id'] as int, nombre: json['nombre'] as String);

  final int id;
  final String nombre;
}

/// Donde se pueden pedir recorridos (`GET /zona-piloto`).
class ZonaPiloto {
  const ZonaPiloto({required this.nombre, required this.contorno});

  final String nombre;

  /// El borde exterior del polígono.
  final List<LatLng> contorno;

  /// Las zonas activas del `FeatureCollection`.
  static List<ZonaPiloto> desdeGeoJson(Map<String, dynamic> json) => [
    for (final zona in json['features'] as List)
      ZonaPiloto(
        nombre:
            ((zona as Map<String, dynamic>)['properties'] as Map)['nombre']
                as String,
        contorno: [
          for (final punto
              in ((zona['geometry'] as Map)['coordinates'] as List).first
                  as List)
            _desdeGeoJson(punto as List),
        ],
      ),
  ];
}

/// El recorrido que calcula el servidor (`GET /recorridos`).
class Recorrido {
  const Recorrido({
    required this.distanciaMetros,
    required this.minutosEstimados,
    required this.traza,
  });

  factory Recorrido.desdeJson(Map<String, dynamic> json) => Recorrido(
    distanciaMetros: json['distanciaMetros'] as int,
    minutosEstimados: json['minutosEstimados'] as int,
    traza: [
      for (final punto in (json['geometria'] as Map)['coordinates'] as List)
        _desdeGeoJson(punto as List),
    ],
  );

  final int distanciaMetros;
  final int minutosEstimados;

  /// Los puntos del camino, del origen al destino.
  final List<LatLng> traza;

  /// "450 m" o "1,2 km", para mostrar y para el lector de pantalla.
  String get distancia => distanciaMetros < 1000
      ? '$distanciaMetros m'
      : '${(distanciaMetros / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';

  /// "9 min" o "1 h 5 min".
  String get tiempo {
    if (minutosEstimados < 60) return '$minutosEstimados min';
    final horas = minutosEstimados ~/ 60;
    final minutos = minutosEstimados % 60;
    return minutos == 0 ? '$horas h' : '$horas h $minutos min';
  }
}

/// Un resultado de la búsqueda de direcciones (`GET /geocodificacion`).
class LugarEncontrado {
  const LugarEncontrado({required this.nombre, required this.punto});

  factory LugarEncontrado.desdeJson(Map<String, dynamic> json) =>
      LugarEncontrado(
        nombre: json['nombre'] as String,
        punto: LatLng(
          (json['lat'] as num).toDouble(),
          (json['lon'] as num).toDouble(),
        ),
      );

  final String nombre;
  final LatLng punto;
}

/// El origen o el destino elegido, con cómo se eligió para mostrarlo.
class PuntoElegido {
  const PuntoElegido(this.punto, this.descripcion);

  final LatLng punto;

  /// "Tu ubicación", "Punto marcado en el mapa" o la dirección encontrada.
  final String descripcion;
}
