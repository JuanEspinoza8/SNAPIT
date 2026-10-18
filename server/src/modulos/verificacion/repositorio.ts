import { Prisma } from '@prisma/client';
import { distanciaHammingSql } from '../../compartido/hashPerceptual.js';
import { type DefinicionParametros, leerParametrosNumericos } from '../../compartido/parametros.js';
import { prisma } from '../../compartido/prisma.js';
import type { ParametrosVerificacion } from './calculo.js';

// Los mismos valores que carga la semilla: si falta un parámetro, se verifica igual con estos.
const PARAMETROS: DefinicionParametros<keyof ParametrosVerificacion> = {
  confianzaBase: { clave: 'verificacion.confianza_base', valor: 50 },
  umbralVerificado: { clave: 'verificacion.umbral_verificado', valor: 60 },
  distanciaExifMaxM: { clave: 'verificacion.distancia_exif_max_m', valor: 100 },
  valorExifCoincide: { clave: 'verificacion.valor_exif_coincide', valor: 20 },
  valorExifNoCoincide: { clave: 'verificacion.valor_exif_no_coincide', valor: -30 },
  valorExifAusente: { clave: 'verificacion.valor_exif_ausente', valor: -10 },
  hammingDuplicadoMax: { clave: 'verificacion.hamming_duplicado_max', valor: 6 },
  valorHashDuplicado: { clave: 'verificacion.valor_hash_duplicado', valor: -40 },
  valorOrigenApp: { clave: 'verificacion.valor_origen_app', valor: 15 },
  valorReputacionMax: { clave: 'verificacion.valor_reputacion_max', valor: 20 },
  diasFotoAntigua: { clave: 'verificacion.dias_foto_antigua', valor: 7 },
  valorFechaAntigua: { clave: 'verificacion.valor_fecha_antigua', valor: -20 },
};

/** Los parámetros verificacion.* de parametro_sistema. Los valores de las señales pueden ser negativos. */
export function leerParametros(): Promise<ParametrosVerificacion> {
  return leerParametrosNumericos(PARAMETROS);
}

export async function leerReputacion(usuarioId: number) {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { reputacion: true },
  });
  return Number(usuario.reputacion);
}

/**
 * La foto ya guardada más parecida a la nueva, si está a no más de `hammingMax` bits. Compara contra las
 * fotos de todos los reportes, también los del mismo vecino: subir dos veces la misma foto tampoco suma.
 */
export async function buscarFotoRepetida(datos: { hash: string; usuarioId: number; hammingMax: number }) {
  const distancia = distanciaHammingSql(Prisma.sql`f.hash_perceptual`, Prisma.sql`${datos.hash}::bit(64)`);
  const [foto] = await prisma.$queryRaw<{ reporteId: number; hamming: number; mismoVecino: boolean }[]>`
    SELECT r.id AS "reporteId", ${distancia}::int AS hamming, r.usuario_id = ${datos.usuarioId} AS "mismoVecino"
    FROM fotografia f
    JOIN reporte r ON r.id = f.reporte_id
    WHERE f.hash_perceptual IS NOT NULL AND ${distancia} <= ${datos.hammingMax}
    ORDER BY hamming, r.id
    LIMIT 1`;
  return foto ?? null;
}
