import 'dart:convert';

// Las mismas reglas que el servidor (`server/src/modulos/auth/esquemas.ts`),
// para avisar debajo del campo antes de enviar. La última palabra la tiene el
// servidor: sus errores se muestran en el mismo lugar.

final _formatoCorreo = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

String? validarCorreo(String? valor) {
  final correo = valor?.trim() ?? '';
  if (correo.isEmpty) return 'Es obligatorio';
  if (!_formatoCorreo.hasMatch(correo)) return 'No es un correo válido';
  if (correo.length > 150) return 'Tiene que tener hasta 150 caracteres';
  return null;
}

String? validarNombre(String? valor) {
  final nombre = valor?.trim() ?? '';
  if (nombre.isEmpty) return 'Es obligatorio';
  if (nombre.length > 120) return 'Tiene que tener hasta 120 caracteres';
  return null;
}

/// Para el ingreso: no se controla el largo, una clave mal escrita la
/// rechaza el servidor.
String? validarClaveIngresada(String? valor) =>
    (valor ?? '').isEmpty ? 'Es obligatoria' : null;

/// Para una clave nueva. El tope es de 72 bytes, no caracteres: una ñ o una
/// vocal con tilde ocupan dos.
String? validarClaveNueva(String? valor) {
  final clave = valor ?? '';
  if (clave.isEmpty) return 'Es obligatoria';
  if (clave.length < 8) return 'Tiene que tener al menos 8 caracteres';
  if (utf8.encode(clave).length > 72) {
    return 'Tiene que tener hasta 72 caracteres (menos si usa tildes o ñ)';
  }
  return null;
}
