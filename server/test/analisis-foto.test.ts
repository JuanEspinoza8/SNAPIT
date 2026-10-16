import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { analizarFoto, leerExif } from '../src/compartido/analisisFoto.js';
import {
  calcularHashPerceptual,
  distanciaHamming,
  distanciaHammingSql,
} from '../src/compartido/hashPerceptual.js';
import { prisma } from '../src/compartido/prisma.js';
import { EXIF_DE_PRUEBA, jpegConExif, jpegSinExif, png1x1 } from './imagenes.js';

/** Un JPEG gris de 16 × 16 con el EXIF que se le pase. */
function jpegCon(exif: sharp.WriteableMetadata['exif']) {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: '#808080' } })
    .withExif(exif!)
    .jpeg()
    .toBuffer();
}

describe('analizarFoto', () => {
  it('lee el tipo, las medidas, el hash y el EXIF de una foto de celular', async () => {
    const foto = await analizarFoto(jpegConExif());

    expect(foto).toEqual({
      tipo: 'jpg',
      ancho: 640,
      alto: 480,
      hashPerceptual: expect.stringMatching(/^[01]{64}$/),
      exif: EXIF_DE_PRUEBA,
    });
  });

  it('una foto sin EXIF deja esos campos en null sin fallar', async () => {
    const foto = await analizarFoto(jpegSinExif());

    expect(foto).toMatchObject({
      tipo: 'jpg',
      exif: { latitud: null, longitud: null, tomadaEn: null, marca: null, modelo: null },
    });
    expect(foto!.hashPerceptual).toMatch(/^[01]{64}$/);
  });

  it('acepta PNG', async () => {
    expect(await analizarFoto(png1x1)).toMatchObject({ tipo: 'png', ancho: 1, alto: 1 });
  });

  it('devuelve null si no es una imagen o es de otro formato', async () => {
    const webp = await sharp(jpegSinExif()).webp().toBuffer();

    expect(await analizarFoto(Buffer.from('no soy una imagen'))).toBeNull();
    expect(await analizarFoto(webp)).toBeNull();
  });

  it('si la imagen está cortada a la mitad, la acepta igual con el hash en null', async () => {
    const original = jpegSinExif();
    const cortada = original.subarray(0, original.length / 2);

    const foto = await analizarFoto(cortada);

    expect(foto).toMatchObject({ tipo: 'jpg', ancho: 640, alto: 480, hashPerceptual: null });
  });
});

describe('leerExif', () => {
  it('sin zona horaria en el EXIF, interpreta la fecha en la hora de Argentina', async () => {
    const foto = await jpegCon({ IFD2: { DateTimeOriginal: '2026:10:15 14:30:00' } });

    expect((await leerExif(foto)).tomadaEn).toEqual(new Date('2026-10-15T17:30:00Z'));
  });

  it('respeta la zona horaria que grabó la cámara', async () => {
    const foto = await jpegCon({
      IFD2: { DateTimeOriginal: '2026:10:15 14:30:00', OffsetTimeOriginal: '+02:00' },
    });

    expect((await leerExif(foto)).tomadaEn).toEqual(new Date('2026-10-15T12:30:00Z'));
  });

  it('descarta una fecha vacía', async () => {
    const foto = await jpegCon({ IFD2: { DateTimeOriginal: '0000:00:00 00:00:00' } });

    expect((await leerExif(foto)).tomadaEn).toBeNull();
  });

  it('el hemisferio norte y el este dan coordenadas positivas', async () => {
    const foto = await jpegCon({
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '40/1 25/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '3/1 42/1 0/1',
      },
    });

    expect(await leerExif(foto)).toMatchObject({ latitud: 40.416667, longitud: 3.7 });
  });

  it('descarta la ubicación 0, 0 que graban algunos celulares sin señal', async () => {
    const foto = await jpegCon({
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '0/1 0/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '0/1 0/1 0/1',
      },
    });

    expect(await leerExif(foto)).toMatchObject({ latitud: null, longitud: null });
  });

  it('sin longitud no guarda tampoco la latitud', async () => {
    const foto = await jpegCon({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '38/1 57/1 6/1' } });

    expect(await leerExif(foto)).toMatchObject({ latitud: null, longitud: null });
  });

  it('recorta la marca y el modelo al largo de la columna', async () => {
    const foto = await jpegCon({ IFD0: { Make: '  Marca  ', Model: 'M'.repeat(80) } });

    expect(await leerExif(foto)).toMatchObject({ marca: 'Marca', modelo: 'M'.repeat(60) });
  });
});

describe('hash perceptual', () => {
  it('la misma foto recomprimida queda a 6 bits o menos', async () => {
    for (const original of [jpegConExif(), jpegSinExif()]) {
      const hash = await calcularHashPerceptual(original);
      const variantes = [
        await sharp(original).jpeg({ quality: 30 }).toBuffer(),
        await sharp(original).resize(320).jpeg({ quality: 60 }).toBuffer(),
        await sharp(original).png().toBuffer(),
      ];
      for (const variante of variantes) {
        expect(distanciaHamming(hash, await calcularHashPerceptual(variante))).toBeLessThanOrEqual(6);
      }
    }
  });

  it('una foto acostada con el EXIF que dice "girar 90°" da el mismo hash que la derecha', async () => {
    const original = jpegSinExif();
    // Así guardan muchos celulares: los píxeles acostados y la orientación marcada aparte.
    const acostada = await sharp(original)
      .rotate(-90)
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 90 })
      .toBuffer();

    expect(
      distanciaHamming(await calcularHashPerceptual(original), await calcularHashPerceptual(acostada)),
    ).toBeLessThanOrEqual(6);
  });

  it('dos fotos distintas quedan a más de 20 bits', async () => {
    const calle = await calcularHashPerceptual(jpegConExif());
    const vereda = await calcularHashPerceptual(jpegSinExif());

    expect(distanciaHamming(calle, vereda)).toBeGreaterThan(20);
  });

  it('distanciaHamming cuenta los bits distintos y rechaza hashes de otro largo', () => {
    const ceros = '0'.repeat(64);

    expect(distanciaHamming(ceros, ceros)).toBe(0);
    expect(distanciaHamming(ceros, '1'.repeat(64))).toBe(64);
    expect(distanciaHamming(ceros, '1010' + '0'.repeat(60))).toBe(2);
    expect(() => distanciaHamming(ceros, '0101')).toThrow();
  });

  it('la distancia en SQL da lo mismo que en TypeScript', async () => {
    const a = await calcularHashPerceptual(jpegConExif());
    const b = await calcularHashPerceptual(jpegSinExif());

    const [fila] = await prisma.$queryRaw<{ distancia: number }[]>`
      SELECT ${distanciaHammingSql(Prisma.sql`${a}::bit(64)`, Prisma.sql`${b}::bit(64)`)}::int AS distancia`;

    expect(fila!.distancia).toBe(distanciaHamming(a, b));
  });
});
