// Lo que se controla al elegir una foto, antes de mandarla: reportar (F02) y cerrar un incidente (F09).

// Las que acepta el servidor, que las guarda en WebP. Cualquier otra la rechazaría recién al enviar. La HEIC del
// iPhone va también por extensión: en Windows el navegador no le conoce el tipo y la manda sin él.
export const TIPOS_FOTO = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  '.heic',
  '.heif',
];

const EXTENSIONES_SIN_TIPO = /\.(heic|heif)$/i;

// El tope de nginx en la demo (client_max_body_size de nginx.conf): más pesada, ni llega al servidor.
// El límite del servidor (FOTO_MAX_MB) es menor y lo avisa él (decisión del 11/10).
export const PESO_MAXIMO_MB = 20;

/** Qué tiene de malo la foto elegida, o null si se puede mandar. */
export function problemaConLaFoto(archivo: File): string | null {
  const aceptada = archivo.type ? TIPOS_FOTO.includes(archivo.type) : EXTENSIONES_SIN_TIPO.test(archivo.name);
  if (!aceptada) return 'Tiene que ser una foto JPG, PNG, WebP o HEIC';
  if (archivo.size > PESO_MAXIMO_MB * 1024 * 1024) {
    return `Pesa demasiado: elegí una foto de hasta ${PESO_MAXIMO_MB} MB`;
  }
  return null;
}
