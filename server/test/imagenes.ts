/** Imágenes mínimas armadas byte a byte para los tests: alcanza con que image-size lea sus medidas. */

function segmento(marcador: number, contenido: Buffer) {
  const largo = Buffer.alloc(2);
  largo.writeUInt16BE(contenido.length + 2);
  return Buffer.concat([Buffer.from([0xff, marcador]), largo, contenido]);
}

/**
 * JPEG de `ancho` × `alto` con un bloque EXIF (APP1). Sirve para comprobar que la foto se guarda
 * sin recomprimir: si el servidor la tocara, el EXIF se perdería.
 */
export function jpegConExif(ancho = 3, alto = 2) {
  const exif = Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    // Encabezado TIFF "little endian" sin entradas: un EXIF válido y vacío, más una marca para reconocerlo.
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from('marca-de-prueba-snapit', 'latin1'),
  ]);
  const medidas = Buffer.alloc(4);
  medidas.writeUInt16BE(alto, 0);
  medidas.writeUInt16BE(ancho, 2);
  const sof = Buffer.concat([
    Buffer.from([0x08]),
    medidas,
    Buffer.from([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segmento(0xe1, exif),
    segmento(0xc0, sof),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** PNG de 1 × 1 píxel. */
export const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
