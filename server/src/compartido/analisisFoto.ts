import exifr from 'exifr';
import decodificarHeic from 'heic-decode';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { logger } from '../config/logger.js';
import { calcularHashPerceptual } from './hashPerceptual.js';

/** Lo que el sistema sabe de una foto apenas llega, antes de guardarla. */
export interface FotoAnalizada {
  /** La foto como se guarda y se sirve: WebP, girada, achicada y sin metadatos. */
  archivo: Buffer;
  tipo: 'webp';
  /** Las medidas de la foto guardada. */
  ancho: number;
  alto: number;
  /** dHash de 64 bits (ver hashPerceptual.ts), de la foto original. Null si no se pudo calcular. */
  hashPerceptual: string | null;
  /** Lo que grabó la cámara en la foto original: la guardada ya no lo trae. */
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

// Lo que se acepta, según el contenido (no la extensión): las fotos de cualquier celular. «heif» es tanto el HEIC
// del iPhone como el AVIF.
const FORMATOS_ACEPTADOS = new Set(['jpeg', 'png', 'webp', 'heif']);

/**
 * Cómo se guarda cada foto: el lado mayor en 1920 px (alcanza para verla a pantalla completa y para la IA, que la
 * achica a 1568) y en WebP con calidad 80. Una foto de 8 MB de un celular queda en unos 200 a 400 KB.
 */
export const LADO_MAXIMO_GUARDADO = 1920;
const CALIDAD_WEBP = 80;

/**
 * Deja la foto en algo que sharp pueda leer. Casi todas ya lo son; el HEIC del iPhone no, porque sharp viene sin
 * el decodificador HEVC (patentes): se decodifica con libheif (heic-decode, en WebAssembly) y se pasa a un JPEG de
 * alta calidad, solo en memoria. libheif ya aplica el giro de la foto, y el JPEG no lleva EXIF: no se gira dos
 * veces. Null si no es una imagen que se acepte.
 */
export async function normalizarFoto(contenido: Buffer): Promise<Buffer | null> {
  let metadatos: Metadata;
  try {
    metadatos = await sharp(contenido).metadata();
  } catch {
    return null;
  }
  if (!metadatos.format || !FORMATOS_ACEPTADOS.has(metadatos.format)) return null;
  if (!metadatos.width || !metadatos.height) return null;
  if (metadatos.format !== 'heif' || metadatos.compression !== 'hevc') return contenido;
  try {
    const { width, height, data } = await decodificarHeic({ buffer: contenido });
    return await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (error) {
    logger.warn({ err: error }, 'No se pudo decodificar la foto HEIC');
    return null;
  }
}

/**
 * La foto como se guarda y se sirve: girada según su EXIF, con el lado mayor en LADO_MAXIMO_GUARDADO y en WebP.
 * Sin withMetadata: sale sin EXIF (ni ubicación exacta ni modelo del teléfono). Recibe una foto ya normalizada
 * (normalizarFoto). Null si no se puede convertir. La usa también la compresión de las fotos ya guardadas.
 */
export async function aWebp(normalizada: Buffer) {
  let resultado: { data: Buffer; info: OutputInfo };
  try {
    resultado = await sharp(normalizada, { failOn: 'none' })
      .rotate()
      .resize({
        width: LADO_MAXIMO_GUARDADO,
        height: LADO_MAXIMO_GUARDADO,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }
  return { archivo: resultado.data, ancho: resultado.info.width, alto: resultado.info.height };
}

/**
 * Prepara una foto que llega: la normaliza, calcula el hash perceptual, extrae el EXIF y arma la WebP que se
 * guarda. Devuelve null si no es una imagen que se acepte (JPG, PNG, WebP, HEIC o AVIF).
 *
 * Solo la lectura de la imagen puede rechazar la foto: si falla el hash o el EXIF, esos datos quedan en null y la
 * foto se acepta igual, porque el vecino no tiene cómo arreglarlo.
 */
export async function analizarFoto(contenido: Buffer): Promise<FotoAnalizada | null> {
  const normalizada = await normalizarFoto(contenido);
  if (!normalizada) return null;

  const guardada = await aWebp(normalizada);
  if (!guardada) return null;

  const [hashPerceptual, exif] = await Promise.all([
    calcularHashPerceptual(normalizada).catch((error: unknown) => {
      logger.warn({ err: error }, 'No se pudo calcular el hash perceptual de la foto');
      return null;
    }),
    // Del original: la normalizada de un HEIC ya no tiene EXIF.
    leerExif(contenido),
  ]);
  return {
    archivo: guardada.archivo,
    tipo: 'webp',
    ancho: guardada.ancho,
    alto: guardada.alto,
    hashPerceptual,
    exif,
  };
}

/** Extrae los datos EXIF que usa la verificación (#50). Nunca falla: lo que no se puede leer queda en null. */
export async function leerExif(contenido: Buffer): Promise<DatosExif> {
  const crudo = (await leerCampos(contenido)) ?? (await leerCampos(await bloqueExif(contenido)));
  if (!crudo) return SIN_EXIF;

  let latitud = coordenada(crudo.GPSLatitude, crudo.GPSLatitudeRef, ['N', 'S'], 90);
  let longitud = coordenada(crudo.GPSLongitude, crudo.GPSLongitudeRef, ['E', 'W'], 180);
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

const CAMPOS_EXIF = [
  'Make',
  'Model',
  'DateTimeOriginal',
  'OffsetTimeOriginal',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
];

async function leerCampos(contenido: Buffer | null): Promise<Record<string, unknown> | null> {
  if (!contenido) return null;
  try {
    // Sin reviveValues, la fecha llega como el texto que grabó la cámara y se interpreta acá, con su
    // zona horaria; si no, exifr la toma en la zona del servidor (UTC en Docker) y la corre tres horas.
    const crudo = await exifr.parse(contenido, { reviveValues: false, pick: CAMPOS_EXIF });
    return crudo && Object.keys(crudo).length > 0 ? crudo : null;
  } catch {
    return null;
  }
}

/**
 * El EXIF tal como lo encuentra sharp (libvips), sin el prefijo "Exif\0\0": queda un TIFF que exifr sí lee.
 * Hace falta con las HEIC de los iPhone nuevos, que exifr no reconoce como archivo aunque traigan GPS.
 */
async function bloqueExif(contenido: Buffer): Promise<Buffer | null> {
  try {
    const { exif } = await sharp(contenido).metadata();
    if (!exif) return null;
    return exif.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? exif.subarray(6) : exif;
  } catch {
    return null;
  }
}

/** Grados, minutos y segundos a grados decimales, con 6 decimales (unos 10 cm), como la columna. */
function coordenada(
  valor: unknown,
  referencia: unknown,
  [positiva, negativa]: readonly [string, string],
  maximo: number,
) {
  if (!Array.isArray(valor) || valor.length !== 3 || !valor.every(Number.isFinite)) return null;
  const [grados, minutos, segundos] = valor as [number, number, number];
  const absoluta = grados + minutos / 60 + segundos / 3600;
  if (absoluta > maximo) return null;
  // Sin el hemisferio no se sabe el signo: mejor sin ubicación que una en la otra punta del mundo.
  const hemisferio = typeof referencia === 'string' ? referencia.trim().toUpperCase() : null;
  if (hemisferio !== positiva && hemisferio !== negativa) return null;
  return Math.round((hemisferio === negativa ? -1 : 1) * absoluta * 1e6) / 1e6;
}

/** "2026:10:15 14:30:00" más la zona ("-03:00") a una fecha. Null si falta o es inválida (p. ej. "0000:00:00"). */
function fechaExif(valor: unknown, zona: unknown): Date | null {
  if (typeof valor !== 'string') return null;
  const partes = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(valor.trim());
  if (!partes) return null;
  const [, anio, mes, dia, hora, minuto, segundo] = partes;
  // Date pasa al mes siguiente un día que no existe (31 de febrero → 3 de marzo) en lugar de rechazarlo.
  if (Number(dia) > new Date(Date.UTC(Number(anio), Number(mes), 0)).getUTCDate()) return null;
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
