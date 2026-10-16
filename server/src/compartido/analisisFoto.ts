import exifr from 'exifr';
import sharp, { type Metadata } from 'sharp';
import { logger } from '../config/logger.js';
import { calcularHashPerceptual } from './hashPerceptual.js';

/** Lo que el sistema sabe de una foto apenas llega, antes de guardarla. */
export interface FotoAnalizada {
  tipo: 'jpg' | 'png';
  ancho: number;
  alto: number;
  /** dHash de 64 bits (ver hashPerceptual.ts). Null si la imagen no se pudo decodificar entera. */
  hashPerceptual: string | null;
  exif: DatosExif;
}

/** Datos que grabó la cámara. Cada uno es null si la foto no lo trae o trae un valor inválido. */
export interface DatosExif {
  latitud: number | null;
  longitud: number | null;
  tomadaEn: Date | null;
  marca: string | null;
  modelo: string | null;
}

const SIN_EXIF: DatosExif = { latitud: null, longitud: null, tomadaEn: null, marca: null, modelo: null };

// EXIF guarda la hora del reloj del celular sin zona horaria; las cámaras nuevas la agregan aparte
// (OffsetTimeOriginal). Si no está, se asume la de Neuquén: Argentina no cambia la hora en verano.
const ZONA_HORARIA_SI_FALTA = '-03:00';

// Largo de las columnas exif_marca y exif_modelo.
const LARGO_MAXIMO_TEXTO = 60;

const FORMATOS = { jpeg: 'jpg', png: 'png' } as const;

/**
 * Lee el tipo y las medidas mirando el contenido (no la extensión ni lo que dice el cliente), calcula
 * el hash perceptual y extrae el EXIF. Devuelve null si no es una imagen JPG o PNG.
 *
 * Solo la lectura del tipo puede rechazar la foto: si falla el hash o el EXIF, esos datos quedan en
 * null y la foto se acepta igual, porque el vecino no tiene cómo arreglarlo.
 */
export async function analizarFoto(contenido: Buffer): Promise<FotoAnalizada | null> {
  let metadatos: Metadata;
  try {
    metadatos = await sharp(contenido).metadata();
  } catch {
    return null;
  }
  const tipo = FORMATOS[metadatos.format as keyof typeof FORMATOS];
  if (!tipo || !metadatos.width || !metadatos.height) return null;

  const [hashPerceptual, exif] = await Promise.all([
    calcularHashPerceptual(contenido).catch((error: unknown) => {
      logger.warn({ err: error }, 'No se pudo calcular el hash perceptual de la foto');
      return null;
    }),
    leerExif(contenido),
  ]);
  return { tipo, ancho: metadatos.width, alto: metadatos.height, hashPerceptual, exif };
}

/** Extrae los datos EXIF que usa la verificación (#50). Nunca falla: lo que no se puede leer queda en null. */
export async function leerExif(contenido: Buffer): Promise<DatosExif> {
  let crudo: Record<string, unknown> | undefined;
  try {
    // Sin reviveValues, la fecha llega como el texto que grabó la cámara y se interpreta acá, con su
    // zona horaria; si no, exifr la toma en la zona del servidor (UTC en Docker) y la corre tres horas.
    crudo = await exifr.parse(contenido, {
      reviveValues: false,
      pick: [
        'Make',
        'Model',
        'DateTimeOriginal',
        'OffsetTimeOriginal',
        'GPSLatitude',
        'GPSLatitudeRef',
        'GPSLongitude',
        'GPSLongitudeRef',
      ],
    });
  } catch {
    return SIN_EXIF;
  }
  if (!crudo) return SIN_EXIF;

  let latitud = coordenada(crudo.GPSLatitude, crudo.GPSLatitudeRef, 'S', 90);
  let longitud = coordenada(crudo.GPSLongitude, crudo.GPSLongitudeRef, 'W', 180);
  // Sin las dos no hay ubicación. Y 0, 0 es lo que graban algunos celulares cuando no tienen señal.
  if (latitud === null || longitud === null || (latitud === 0 && longitud === 0)) {
    latitud = null;
    longitud = null;
  }

  return {
    latitud,
    longitud,
    tomadaEn: fechaExif(crudo.DateTimeOriginal, crudo.OffsetTimeOriginal),
    marca: texto(crudo.Make),
    modelo: texto(crudo.Model),
  };
}

/** Grados, minutos y segundos a grados decimales, con 6 decimales (unos 10 cm), como la columna. */
function coordenada(valor: unknown, referencia: unknown, negativa: 'S' | 'W', maximo: number) {
  if (!Array.isArray(valor) || valor.length !== 3 || !valor.every(Number.isFinite)) return null;
  const [grados, minutos, segundos] = valor as [number, number, number];
  const absoluta = grados + minutos / 60 + segundos / 3600;
  if (absoluta > maximo) return null;
  const signo = typeof referencia === 'string' && referencia.trim().toUpperCase() === negativa ? -1 : 1;
  return Math.round(signo * absoluta * 1e6) / 1e6;
}

/** "2026:10:15 14:30:00" más la zona ("-03:00") a una fecha. Null si falta o es inválida (p. ej. "0000:00:00"). */
function fechaExif(valor: unknown, zona: unknown): Date | null {
  if (typeof valor !== 'string') return null;
  const partes = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(valor.trim());
  if (!partes) return null;
  const [, anio, mes, dia, hora, minuto, segundo] = partes;
  const zonaValida = typeof zona === 'string' && /^[+-]\d{2}:\d{2}$/.test(zona.trim());
  const fecha = new Date(
    `${anio}-${mes}-${dia}T${hora}:${minuto}:${segundo}${zonaValida ? zona.trim() : ZONA_HORARIA_SI_FALTA}`,
  );
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  // Algunas cámaras rellenan con caracteres nulos.
  // eslint-disable-next-line no-control-regex
  const limpio = valor.replace(/\u0000/g, '').trim();
  return limpio ? limpio.slice(0, LARGO_MAXIMO_TEXTO) : null;
}
