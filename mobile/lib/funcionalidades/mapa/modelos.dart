import 'package:flutter/foundation.dart';

// Formas que devuelve la API (docs/api.md, sección «Mapa público»).

/// Los estados que pueden aparecer en el mapa: los desestimados nunca llegan.
enum EstadoVisible {
  registrado('REGISTRADO'),
  verificado('VERIFICADO'),
  derivado('DERIVADO'),
  enEjecucion('EN_EJECUCION'),
  resuelto('RESUELTO');

  const EstadoVisible(this.valorApi);

  final String valorApi;

  static EstadoVisible desdeApi(String valor) {
    for (final estado in values) {
      if (estado.valorApi == valor) return estado;
    }
    throw FormatException('Estado de incidente desconocido: $valor');
  }
}

/// Un incidente en el mapa (`GET /incidentes`).
class PuntoMapa {
  const PuntoMapa({
    required this.id,
    required this.lat,
    required this.lon,
    required this.categoriaId,
    required this.categoriaNombre,
    required this.estado,
    required this.enRevision,
    required this.primerReporteEn,
    required this.cantidadReportes,
  });

  factory PuntoMapa.desdeJson(Map<String, dynamic> json) => PuntoMapa(
    id: json['id'] as int,
    lat: (json['lat'] as num).toDouble(),
    lon: (json['lon'] as num).toDouble(),
    categoriaId: json['categoriaId'] as int,
    categoriaNombre: json['categoriaNombre'] as String,
    estado: EstadoVisible.desdeApi(json['estado'] as String),
    enRevision: json['enRevision'] as bool,
    primerReporteEn: DateTime.parse(json['primerReporteEn'] as String),
    cantidadReportes: json['cantidadReportes'] as int,
  );

  final int id;
  final double lat;
  final double lon;
  final int categoriaId;
  final String categoriaNombre;
  final EstadoVisible estado;
  final bool enRevision;
  final DateTime primerReporteEn;
  final int cantidadReportes;
}

/// Lo que se abre al tocar un punto (`GET /incidentes/:id`).
class FichaIncidente {
  const FichaIncidente({
    required this.id,
    required this.categoriaNombre,
    required this.estado,
    required this.enRevision,
    required this.primerReporteEn,
    required this.cantidadVecinos,
    required this.direccion,
    required this.fotoIds,
  });

  factory FichaIncidente.desdeJson(Map<String, dynamic> json) => FichaIncidente(
    id: json['id'] as int,
    categoriaNombre: (json['categoria'] as Map)['nombre'] as String,
    estado: EstadoVisible.desdeApi(json['estado'] as String),
    enRevision: json['enRevision'] as bool,
    primerReporteEn: DateTime.parse(json['primerReporteEn'] as String),
    cantidadVecinos: json['cantidadVecinos'] as int,
    direccion: json['direccion'] as String?,
    fotoIds: [
      for (final foto in json['fotos'] as List) (foto as Map)['id'] as int,
    ],
  );

  final int id;
  final String categoriaNombre;
  final EstadoVisible estado;
  final bool enRevision;
  final DateTime primerReporteEn;
  final int cantidadVecinos;
  final String? direccion;

  /// La app pide cada foto a `fotos/<id>` sobre su URL base, que ya termina
  /// en `/api`.
  final List<int> fotoIds;
}

class Categoria {
  const Categoria({required this.id, required this.nombre});

  factory Categoria.desdeJson(Map<String, dynamic> json) =>
      Categoria(id: json['id'] as int, nombre: json['nombre'] as String);

  final int id;
  final String nombre;
}

/// Filtros del mapa. Las fechas son días: el servidor los toma completos, en
/// hora de Argentina.
@immutable
class FiltrosMapa {
  const FiltrosMapa({this.categoriaId, this.estado, this.desde, this.hasta});

  final int? categoriaId;
  final EstadoVisible? estado;
  final DateTime? desde;
  final DateTime? hasta;

  int get cantidadActivos =>
      [categoriaId, estado, desde, hasta].where((f) => f != null).length;

  @override
  bool operator ==(Object other) =>
      other is FiltrosMapa &&
      other.categoriaId == categoriaId &&
      other.estado == estado &&
      other.desde == desde &&
      other.hasta == hasta;

  @override
  int get hashCode => Object.hash(categoriaId, estado, desde, hasta);
}

/// El rectángulo visible del mapa, en grados.
@immutable
class Rectangulo {
  const Rectangulo({
    required this.oeste,
    required this.sur,
    required this.este,
    required this.norte,
  });

  /// Redondea a 4 decimales (unos 10 m) para no volver a pedir los puntos por
  /// un movimiento mínimo. Redondea hacia afuera, para que nunca quede sin
  /// pedir algo que se ve en el borde. Recorta a los límites que acepta el
  /// servidor: muy alejado, el mapa se pasa de ±180 y ±90.
  factory Rectangulo.paraConsulta({
    required double oeste,
    required double sur,
    required double este,
    required double norte,
  }) {
    double haciaAbajo(double valor, double limite) =>
        (valor.clamp(-limite, limite) * 10000).floorToDouble() / 10000;
    double haciaArriba(double valor, double limite) =>
        (valor.clamp(-limite, limite) * 10000).ceilToDouble() / 10000;
    return Rectangulo(
      oeste: haciaAbajo(oeste, 180),
      sur: haciaAbajo(sur, 90),
      este: haciaArriba(este, 180),
      norte: haciaArriba(norte, 90),
    );
  }

  final double oeste;
  final double sur;
  final double este;
  final double norte;

  @override
  bool operator ==(Object other) =>
      other is Rectangulo &&
      other.oeste == oeste &&
      other.sur == sur &&
      other.este == este &&
      other.norte == norte;

  @override
  int get hashCode => Object.hash(oeste, sur, este, norte);
}
