/// Un reporte como lo manda `GET /reportes/mios`.
Map<String, Object?> reporteJson({
  int id = 15,
  String estadoVerificacion = 'PENDIENTE_REVISION',
  Map<String, Object?>? incidente = const {
    'id': 9,
    'estado': 'REGISTRADO',
    'enRevision': true,
  },
  List<Map<String, Object?>> fotos = const [
    {'id': 1, 'url': '/api/fotos/1'},
  ],
}) => {
  'id': id,
  'registradoEn': '2026-10-06T15:15:33.494Z',
  'categoria': {'id': 3, 'nombre': 'Cordón sin rampa'},
  'severidadDeclarada': 'GRAVE',
  'descripcion': 'Pozo grande frente a la escuela',
  'fotos': fotos,
  'estadoVerificacion': estadoVerificacion,
  'incidente': incidente,
};
