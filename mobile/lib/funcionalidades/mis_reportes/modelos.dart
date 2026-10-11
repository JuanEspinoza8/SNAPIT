// Forma que devuelve `GET /reportes/mios` (docs/api.md, sección «Reportes»).

/// Qué pasó con este reporte (`estado_verificacion`).
enum EstadoVerificacion {
  pendienteRevision('PENDIENTE_REVISION'),
  verificado('VERIFICADO'),
  desestimado('DESESTIMADO');

  const EstadoVerificacion(this.valorApi);

  final String valorApi;

  static EstadoVerificacion desdeApi(String valor) {
    for (final estado in values) {
      if (estado.valorApi == valor) return estado;
    }
    throw FormatException('Estado de verificación desconocido: $valor');
  }
}

/// Qué pasa con el problema (`estado_incidente`). A diferencia del mapa,
/// incluye el desestimado.
enum EstadoIncidente {
  registrado('REGISTRADO'),
  verificado('VERIFICADO'),
  derivado('DERIVADO'),
  enEjecucion('EN_EJECUCION'),
  resuelto('RESUELTO'),
  desestimado('DESESTIMADO');

  const EstadoIncidente(this.valorApi);

  final String valorApi;

  static EstadoIncidente desdeApi(String valor) {
    for (final estado in values) {
      if (estado.valorApi == valor) return estado;
    }
    throw FormatException('Estado de incidente desconocido: $valor');
  }
}

/// El único estado que se muestra en la fila. Al vecino le importa qué pasa
/// con el problema, así que manda el del incidente, salvo que su reporte se
/// haya desestimado: entonces el problema puede seguir (lo verificaron otros),
/// pero su aporte no cuenta. Sin incidente, se usa la verificación.
EstadoIncidente estadoParaElVecino(
  EstadoVerificacion verificacion,
  EstadoIncidente? incidente,
) {
  if (verificacion == EstadoVerificacion.desestimado) {
    return EstadoIncidente.desestimado;
  }
  if (incidente != null) return incidente;
  return verificacion == EstadoVerificacion.verificado
      ? EstadoIncidente.verificado
      : EstadoIncidente.registrado;
}

/// Un reporte del vecino de la sesión.
class ReporteMio {
  const ReporteMio({
    required this.id,
    required this.registradoEn,
    required this.categoriaNombre,
    required this.fotoIds,
    required this.estadoVerificacion,
    required this.incidenteId,
    required this.estadoIncidente,
  });

  factory ReporteMio.desdeJson(Map<String, dynamic> json) {
    final incidente = json['incidente'] as Map<String, dynamic>?;
    return ReporteMio(
      id: json['id'] as int,
      registradoEn: DateTime.parse(json['registradoEn'] as String),
      categoriaNombre: (json['categoria'] as Map)['nombre'] as String,
      fotoIds: [
        for (final foto in json['fotos'] as List) (foto as Map)['id'] as int,
      ],
      estadoVerificacion: EstadoVerificacion.desdeApi(
        json['estadoVerificacion'] as String,
      ),
      incidenteId: incidente?['id'] as int?,
      estadoIncidente: incidente == null
          ? null
          : EstadoIncidente.desdeApi(incidente['estado'] as String),
    );
  }

  final int id;
  final DateTime registradoEn;
  final String categoriaNombre;
  final List<int> fotoIds;
  final EstadoVerificacion estadoVerificacion;

  /// Si el incidente se unió a otro, el servidor ya manda el principal.
  final int? incidenteId;
  final EstadoIncidente? estadoIncidente;

  EstadoIncidente get estado =>
      estadoParaElVecino(estadoVerificacion, estadoIncidente);

  /// La ficha es la del mapa público: un incidente desestimado no la tiene.
  bool get tieneFicha =>
      incidenteId != null && estadoIncidente != EstadoIncidente.desestimado;
}
