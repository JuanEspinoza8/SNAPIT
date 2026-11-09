// Formas de `GET /notificaciones` (docs/api.md, sección «Avisos al vecino»).

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
