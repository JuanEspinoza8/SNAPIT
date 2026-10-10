const _meses = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/// Un instante de la API (UTC) como fecha de Argentina: «6 de octubre de 2026».
/// Argentina no tiene horario de verano, así que es UTC−3 todo el año, sin
/// depender de la zona horaria del teléfono.
String fechaLarga(DateTime instante) {
  final argentina = instante.toUtc().subtract(const Duration(hours: 3));
  return '${argentina.day} de ${_meses[argentina.month - 1]} de '
      '${argentina.year}';
}

/// Un día elegido en el calendario: «6/10/2026».
String fechaCorta(DateTime dia) => '${dia.day}/${dia.month}/${dia.year}';

/// Un día como lo recibe la API: «2026-10-06».
String fechaApi(DateTime dia) =>
    '${dia.year.toString().padLeft(4, '0')}-'
    '${dia.month.toString().padLeft(2, '0')}-'
    '${dia.day.toString().padLeft(2, '0')}';
