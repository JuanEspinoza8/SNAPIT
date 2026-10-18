import { contarUnos } from '../../compartido/hashPerceptual.js';
import { calcularConfianza, type ResultadoConfianza } from './calculo.js';
import * as repositorio from './repositorio.js';

export interface ReporteAVerificar {
  usuarioId: number;
  lat: number;
  lon: number;
  registradoEn: Date;
  tomadaConCamaraApp: boolean;
  exif: { latitud: number | null; longitud: number | null; tomadaEn: Date | null };
  /** Hash perceptual de la foto (#47). Null si no se pudo calcular: entonces no se busca si está repetida. */
  hashPerceptual: string | null;
}

/**
 * Si el hash sirve para decir que dos fotos son la misma. Con `hammingMax` unos o menos queda a esa distancia
 * de una foto lisa (64 ceros), así que coincidiría con cualquier foto lisa u oscura aunque sea otra.
 */
export function hashComparable(hash: string | null, hammingMax: number): hash is string {
  return hash !== null && contarUnos(hash) > hammingMax;
}

/** Verificación automática de un reporte que está por guardarse (F04): junta los datos y calcula el nivel. */
export async function verificarReporte(reporte: ReporteAVerificar): Promise<ResultadoConfianza> {
  const parametros = await repositorio.leerParametros();
  const hash = reporte.hashPerceptual;
  const [reputacion, fotoParecida] = await Promise.all([
    repositorio.leerReputacion(reporte.usuarioId),
    hashComparable(hash, parametros.hammingDuplicadoMax)
      ? repositorio.buscarFotoRepetida({
          hash,
          usuarioId: reporte.usuarioId,
          hammingMax: parametros.hammingDuplicadoMax,
        })
      : null,
  ]);
  return calcularConfianza({ ...reporte, reputacion, fotoParecida }, parametros);
}
