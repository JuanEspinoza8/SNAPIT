/// El autor de un comentario o de un reporte, como lo manda la API.
Map<String, Object?> autorJson(int numero) => {
  'numero': numero,
  'nombre': 'Vecino $numero',
};

const snapitJson = {'numero': null, 'nombre': 'SnapIt', 'sistema': true};

Map<String, Object?> comentarioJson(
  int id,
  String texto, {
  required Map<String, Object?> autor,
  bool editado = false,
  bool esMio = false,
}) => {
  'id': id,
  'texto': texto,
  'creadoEn': '2026-10-07T15:15:33.494Z',
  'editadoEn': editado ? '2026-10-08T15:15:33.494Z' : null,
  'autor': autor,
  'esMio': esMio,
};
