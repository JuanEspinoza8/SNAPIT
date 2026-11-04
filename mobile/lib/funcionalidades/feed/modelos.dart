import '../mapa/modelos.dart';

// Formas de `GET /incidentes/feed` (docs/api.md, sección «Mapa público»).

/// Una tarjeta del feed: un incidente con sus primeras fotos.
class TarjetaFeed {
  const TarjetaFeed({
    required this.id,
    required this.lat,
    required this.lon,
    required this.categoriaNombre,
    required this.estado,
    required this.enRevision,
    required this.gravedad,
    required this.primerReporteEn,
    required this.cantidadReportes,
    required this.cantidadVecinos,
    required this.direccion,
    required this.fotoIds,
    required this.cantidadFotos,
  });

  factory TarjetaFeed.desdeJson(Map<String, dynamic> json) => TarjetaFeed(
    id: json['id'] as int,
    lat: (json['lat'] as num).toDouble(),
    lon: (json['lon'] as num).toDouble(),
    categoriaNombre: (json['categoria'] as Map)['nombre'] as String,
    estado: EstadoVisible.desdeApi(json['estado'] as String),
    enRevision: json['enRevision'] as bool,
    gravedad: Gravedad.desdeApi(json['severidad'] as String),
    primerReporteEn: DateTime.parse(json['primerReporteEn'] as String),
    cantidadReportes: json['cantidadReportes'] as int,
    cantidadVecinos: json['cantidadVecinos'] as int,
    direccion: json['direccion'] as String?,
    fotoIds: [
      for (final foto in json['fotos'] as List) (foto as Map)['id'] as int,
    ],
    cantidadFotos: json['cantidadFotos'] as int,
  );

  final int id;
  final double lat;
  final double lon;
  final String categoriaNombre;
  final EstadoVisible estado;
  final bool enRevision;
  final Gravedad gravedad;
  final DateTime primerReporteEn;
  final int cantidadReportes;
  final int cantidadVecinos;
  final String? direccion;

  /// Hasta cinco: el resto se ve en el detalle.
  final List<int> fotoIds;
  final int cantidadFotos;

  /// Varios reportes juntos: la tarjeta es el «post destacado» del incidente.
  bool get agrupado => cantidadReportes > 1;
}

class PaginaFeed {
  const PaginaFeed({required this.tarjetas, required this.siguiente});

  factory PaginaFeed.desdeJson(Map<String, dynamic> json) => PaginaFeed(
    tarjetas: [
      for (final tarjeta in json['incidentes'] as List)
        TarjetaFeed.desdeJson(tarjeta as Map<String, dynamic>),
    ],
    siguiente: json['siguiente'] as String?,
  );

  final List<TarjetaFeed> tarjetas;

  /// El cursor de la página siguiente. Null: no hay más.
  final String? siguiente;
}
