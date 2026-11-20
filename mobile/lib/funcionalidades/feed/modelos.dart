import '../mapa/modelos.dart';
import 'social.dart';

// Formas de `GET /social/feed` (docs/api.md, sección «Social»).

/// Una publicación del feed: un reporte publicado de un vecino, con la línea
/// a su incidente (el problema en general).
class Publicacion extends ReportePublico {
  const Publicacion({
    required super.id,
    required super.incidenteId,
    required super.descripcion,
    required super.creadoEn,
    required super.autor,
    required super.fotoIds,
    required super.cantidadMeGusta,
    required super.cantidadComentarios,
    super.yaMeGusta,
    required this.categoriaNombre,
    required this.gravedad,
    required this.direccion,
    required this.lat,
    required this.lon,
    required this.derivadoA,
    required this.estadoIncidente,
    required this.cantidadVecinos,
  });

  factory Publicacion.desdeJson(Map<String, dynamic> json) {
    final reporte = ReportePublico.desdeJson(json);
    final incidente = json['incidente'] as Map<String, dynamic>;
    return Publicacion(
      id: reporte.id,
      incidenteId: reporte.incidenteId,
      descripcion: reporte.descripcion,
      creadoEn: reporte.creadoEn,
      autor: reporte.autor,
      fotoIds: reporte.fotoIds,
      cantidadMeGusta: reporte.cantidadMeGusta,
      cantidadComentarios: reporte.cantidadComentarios,
      yaMeGusta: reporte.yaMeGusta,
      categoriaNombre: (json['categoria'] as Map)['nombre'] as String,
      gravedad: Gravedad.desdeApi(json['severidad'] as String),
      direccion: json['direccion'] as String?,
      lat: (json['lat'] as num).toDouble(),
      lon: (json['lon'] as num).toDouble(),
      derivadoA: switch (json['derivadoA']) {
        final Map area => area['nombre'] as String,
        _ => null,
      },
      estadoIncidente: EstadoVisible.desdeApi(incidente['estado'] as String),
      cantidadVecinos: incidente['cantidadVecinos'] as int,
    );
  }

  /// La del incidente: un operador la puede haber corregido.
  final String categoriaNombre;

  /// La que declaró el vecino.
  final Gravedad gravedad;
  final String? direccion;
  final double lat;
  final double lon;

  /// El nombre del área que atiende el problema.
  final String? derivadoA;

  /// En qué está el problema.
  final EstadoVisible estadoIncidente;

  /// Cuántos vecinos reportaron el mismo problema.
  final int cantidadVecinos;

  bool get resuelto => estadoIncidente == EstadoVisible.resuelto;

  Publicacion con({
    bool? yaMeGusta,
    int? cantidadMeGusta,
    int? cantidadComentarios,
  }) => Publicacion(
    id: id,
    incidenteId: incidenteId,
    descripcion: descripcion,
    creadoEn: creadoEn,
    autor: autor,
    fotoIds: fotoIds,
    cantidadMeGusta: cantidadMeGusta ?? this.cantidadMeGusta,
    cantidadComentarios: cantidadComentarios ?? this.cantidadComentarios,
    yaMeGusta: yaMeGusta ?? this.yaMeGusta,
    categoriaNombre: categoriaNombre,
    gravedad: gravedad,
    direccion: direccion,
    lat: lat,
    lon: lon,
    derivadoA: derivadoA,
    estadoIncidente: estadoIncidente,
    cantidadVecinos: cantidadVecinos,
  );
}

class PaginaFeed {
  const PaginaFeed({required this.publicaciones, required this.siguiente});

  factory PaginaFeed.desdeJson(Map<String, dynamic> json) => PaginaFeed(
    publicaciones: [
      for (final publicacion in json['reportes'] as List)
        Publicacion.desdeJson(publicacion as Map<String, dynamic>),
    ],
    siguiente: json['siguiente'] as String?,
  );

  final List<Publicacion> publicaciones;

  /// El cursor de la página siguiente. Null: no hay más.
  final String? siguiente;
}
