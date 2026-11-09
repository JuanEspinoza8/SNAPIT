import 'package:latlong2/latlong.dart';

// Formas de las rutas de avisos (docs/api.md, sección «Avisos al vecino»).

/// Los tipos de aviso que manda el servidor. [otro] cubre uno nuevo que esta
/// versión de la app todavía no conoce.
enum TipoAviso {
  cambioEstado('CAMBIO_ESTADO'),
  nuevoEnZona('NUEVO_EN_ZONA'),
  cierre('CIERRE'),
  verificacion('VERIFICACION'),
  otro('OTRO');

  const TipoAviso(this.valorApi);

  final String valorApi;

  static TipoAviso desdeApi(String valor) {
    for (final tipo in values) {
      if (tipo.valorApi == valor) return tipo;
    }
    return otro;
  }
}

/// Un aviso guardado en el servidor, con o sin entrega al celular.
class Aviso {
  const Aviso({
    required this.id,
    required this.tipo,
    required this.incidenteId,
    required this.titulo,
    required this.cuerpo,
    required this.creadoEn,
    required this.enviadaEn,
    required this.leidaEn,
  });

  factory Aviso.desdeJson(Map<String, dynamic> json) => Aviso(
    id: json['id'] as int,
    tipo: TipoAviso.desdeApi(json['tipo'] as String),
    incidenteId: json['incidenteId'] as int?,
    titulo: json['titulo'] as String,
    cuerpo: json['cuerpo'] as String,
    creadoEn: DateTime.parse(json['creadoEn'] as String),
    enviadaEn: switch (json['enviadaEn']) {
      final String fecha => DateTime.parse(fecha),
      _ => null,
    },
    leidaEn: switch (json['leidaEn']) {
      final String fecha => DateTime.parse(fecha),
      _ => null,
    },
  );

  final int id;
  final TipoAviso tipo;

  /// Null si el aviso no es de un incidente.
  final int? incidenteId;
  final String titulo;
  final String cuerpo;
  final DateTime creadoEn;

  /// Null si no llegó a ningún celular.
  final DateTime? enviadaEn;

  /// Null si todavía no se leyó.
  final DateTime? leidaEn;

  bool get leida => leidaEn != null;

  Aviso marcarLeida(DateTime cuando) => Aviso(
    id: id,
    tipo: tipo,
    incidenteId: incidenteId,
    titulo: titulo,
    cuerpo: cuerpo,
    creadoEn: creadoEn,
    enviadaEn: enviadaEn,
    leidaEn: leidaEn ?? cuando,
  );
}

/// Lo que trae un aviso de FCM. Los datos son textos; [titulo] y [cuerpo]
/// salen de la notificación que muestra el sistema.
class MensajePush {
  const MensajePush({
    this.notificacionId,
    this.tipo,
    this.incidenteId,
    this.titulo,
    this.cuerpo,
  });

  factory MensajePush.desdeDatos(
    Map<String, dynamic> datos, {
    String? titulo,
    String? cuerpo,
  }) => MensajePush(
    notificacionId: _entero(datos['notificacionId']),
    tipo: datos['tipo'] as String?,
    incidenteId: _entero(datos['incidenteId']),
    titulo: titulo,
    cuerpo: cuerpo,
  );

  final int? notificacionId;
  final String? tipo;

  /// Null si el aviso no es de un incidente.
  final int? incidenteId;
  final String? titulo;
  final String? cuerpo;

  static int? _entero(Object? valor) => switch (valor) {
    final int numero => numero,
    final String texto => int.tryParse(texto),
    _ => null,
  };
}

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
