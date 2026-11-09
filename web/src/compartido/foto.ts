// Lo que se controla al elegir una foto, antes de mandarla: reportar (F02) y cerrar un incidente (F09).

// Las que acepta el servidor. Cualquier otra la rechazaría recién al enviar.
export const TIPOS_FOTO = ['image/jpeg', 'image/png'];

// El tope de nginx en la demo (client_max_body_size de nginx.conf): más pesada, ni llega al servidor.
// El límite del servidor (FOTO_MAX_MB) es menor y lo avisa él (decisión del 11/10).
export const PESO_MAXIMO_MB = 20;

/** Qué tiene de malo la foto elegida, o null si se puede mandar. */
export function problemaConLaFoto(archivo: File): string | null {
  if (!TIPOS_FOTO.includes(archivo.type)) return 'Tiene que ser una foto JPG o PNG';
  if (archivo.size > PESO_MAXIMO_MB * 1024 * 1024) {
    return `Pesa demasiado: elegí una foto de hasta ${PESO_MAXIMO_MB} MB`;
  }
  return null;
}
