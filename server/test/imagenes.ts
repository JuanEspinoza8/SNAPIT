import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Fotos de prueba de test/fotos (las genera test/fotos/generar.ts). */
const foto = (nombre: string) => readFileSync(path.join(import.meta.dirname, 'fotos', nombre));

/**
 * JPEG de 640 × 480 con EXIF completo, como lo saca un celular: GPS en Neuquén, fecha, marca y modelo.
 * Sirve también para comprobar que la foto se guarda sin recomprimir: si el servidor la tocara, el
 * EXIF se perdería.
 */
export const jpegConExif = () => foto('calle-con-gps.jpg');

/** Lo que trae jpegConExif() en su EXIF. */
export const EXIF_DE_PRUEBA = {
  // 38° 57' 6" S y 68° 3' 33" O.
  latitud: -38.951667,
  longitud: -68.059167,
  // 15/10/2026 14:30 en Neuquén (-03:00).
  tomadaEn: new Date('2026-10-15T17:30:00Z'),
  marca: 'Motorola',
  modelo: 'moto g54 5G',
};

/** JPEG de 640 × 480, de otra escena, sin ningún metadato. */
export const jpegSinExif = () => foto('vereda-sin-exif.jpg');

/** PNG de 1 × 1 píxel. */
export const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
