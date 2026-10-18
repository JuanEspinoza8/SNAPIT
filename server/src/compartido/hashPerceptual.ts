import { Prisma } from '@prisma/client';
import sharp from 'sharp';

/** Bits del hash: lo que guarda la columna fotografia.hash_perceptual (bit(64)). */
export const BITS_HASH = 64;

/**
 * dHash ("difference hash") de 64 bits, como texto de ceros y unos para la columna bit(64).
 *
 * 1. Se endereza la imagen según su orientación EXIF, así la misma foto da el mismo hash aunque
 *    una app la haya rotado de verdad y otra solo haya marcado la rotación.
 * 2. Se pasa a escala de grises y se reduce a 9 × 8 píxeles, sin mantener la proporción.
 * 3. En cada fila se compara cada píxel con el de su derecha: 1 si es más claro, 0 si no.
 *    Son 8 comparaciones por fila × 8 filas = 64 bits, de arriba hacia abajo y de izquierda a derecha.
 *
 * Como mira solo si la luz sube o baja entre zonas vecinas, sobrevive a la recompresión, al cambio de
 * tamaño y a ajustes leves de brillo. Lanza un error si la imagen no se puede decodificar.
 */
export async function calcularHashPerceptual(contenido: Buffer): Promise<string> {
  // Una foto incompleta se decodifica con lo que llegó. Si no, alcanzaría con cortarle los últimos
  // bytes a una foto ya usada para que quede sin hash y no se detecte como repetida.
  const { data, info } = await sharp(contenido, { failOn: 'none' })
    .rotate()
    // Una zona transparente de un PNG cuenta como blanco.
    .flatten({ background: '#ffffff' })
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const canales = info.channels;
  let bits = '';
  for (let fila = 0; fila < 8; fila++) {
    for (let columna = 0; columna < 8; columna++) {
      const pixel = (fila * 9 + columna) * canales;
      bits += data[pixel]! > data[pixel + canales]! ? '1' : '0';
    }
  }
  return bits;
}

/** Cuántos bits difieren entre dos hashes (distancia de Hamming): 0 es la misma imagen, 64 la opuesta. */
export function distanciaHamming(a: string, b: string): number {
  if (a.length !== BITS_HASH || b.length !== BITS_HASH) {
    throw new Error(`Los hashes tienen que tener ${BITS_HASH} bits`);
  }
  let distancia = 0;
  for (let i = 0; i < BITS_HASH; i++) if (a[i] !== b[i]) distancia++;
  return distancia;
}

/**
 * Cuántos unos tiene un hash. Una imagen lisa (negra, gris o blanca) da 64 ceros, y una muy oscura casi:
 * con pocos unos, el hash se parece al de cualquier otra foto lisa u oscura. En SQL: `bit_count(hash)`.
 */
export function contarUnos(hash: string): number {
  let unos = 0;
  for (const bit of hash) if (bit === '1') unos++;
  return unos;
}

/**
 * La misma distancia calculada en la base, para buscar fotos parecidas sin traerlas todas:
 * `#` es el XOR entre cadenas de bits y `bit_count` cuenta los unos que quedan.
 * Ejemplo: prisma.$queryRaw`SELECT id FROM fotografia f WHERE ${distanciaHammingSql(Prisma.sql`f.hash_perceptual`, Prisma.sql`${hash}::bit(64)`)} <= 6`
 */
export function distanciaHammingSql(a: Prisma.Sql, b: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`bit_count(${a} # ${b})`;
}
