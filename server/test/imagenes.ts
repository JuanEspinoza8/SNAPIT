import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

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

/** JPEG liso de 640 × 480, de un solo gris (0 es negro y 255 blanco): su hash son 64 ceros. */
export const jpegLiso = (gris: number) =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r: gris, g: gris, b: gris } } })
    .jpeg()
    .toBuffer();

/**
 * Una escena nocturna dibujada: fondo casi negro con ruido y una luz chica centrada en (x, y). Dos escenas con
 * la luz en otro lugar son fotos distintas, pero sus hashes tienen pocos unos y quedan cerca entre sí: con
 * (100, 80) y (500, 120), 8 unos cada una y 14 bits de distancia.
 */
export function escenaNocturna(x: number, y: number) {
  const ancho = 640;
  const alto = 480;
  let semilla = x * 7919 + y;
  const azar = () => (semilla = (Math.imul(semilla, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const pixeles = Buffer.alloc(ancho * alto);
  for (let fila = 0; fila < alto; fila++) {
    for (let columna = 0; columna < ancho; columna++) {
      const luz = 230 * Math.exp(-((columna - x) ** 2 + (fila - y) ** 2) / (2 * 25 ** 2));
      pixeles[fila * ancho + columna] = Math.min(255, Math.round(12 + luz + (azar() * 2 - 1) * 6));
    }
  }
  return sharp(pixeles, { raw: { width: ancho, height: alto, channels: 1 } })
    .jpeg()
    .toBuffer();
}

/**
 * La foto de prueba tapada con un mosaico al azar, conservando su EXIF: otra imagen para el hash perceptual.
 * Otros tests suben las mismas fotos de prueba a la base compartida; con una foto única, la verificación no
 * la encuentra repetida (salvo que el test la suba dos veces a propósito).
 */
export async function fotoUnica(base: Buffer) {
  const mosaico = await sharp(randomBytes(16 * 12), { raw: { width: 16, height: 12, channels: 1 } })
    .resize(640, 480, { kernel: 'nearest' })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: mosaico }])
    .withMetadata()
    .jpeg()
    .toBuffer();
}
