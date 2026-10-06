// Las mismas reglas que el servidor (`server/src/modulos/auth/esquemas.ts`),
// para avisar debajo del campo antes de enviar. La última palabra la tiene el
// servidor: sus errores se muestran en el mismo lugar.

const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarCorreo(valor: string): string | null {
  const correo = valor.trim();
  if (!correo) return 'Es obligatorio';
  if (!formatoCorreo.test(correo)) return 'No es un correo válido';
  if (correo.length > 150) return 'Tiene que tener hasta 150 caracteres';
  return null;
}

export function validarNombre(valor: string): string | null {
  const nombre = valor.trim();
  if (!nombre) return 'Es obligatorio';
  if (nombre.length > 120) return 'Tiene que tener hasta 120 caracteres';
  return null;
}

// Para el ingreso: no se controla el largo, una clave mal escrita la
// rechaza el servidor.
export function validarClaveIngresada(valor: string): string | null {
  return valor ? null : 'Es obligatoria';
}

// Para una clave nueva. El tope es de 72 bytes, no caracteres: una ñ o una
// vocal con tilde ocupan dos.
export function validarClaveNueva(valor: string): string | null {
  if (!valor) return 'Es obligatoria';
  if (valor.length < 8) return 'Tiene que tener al menos 8 caracteres';
  if (new TextEncoder().encode(valor).length > 72) {
    return 'Tiene que tener hasta 72 caracteres (menos si usa tildes o ñ)';
  }
  return null;
}
