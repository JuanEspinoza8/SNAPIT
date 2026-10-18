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

/** Verificación automática de un reporte que está por guardarse (F04): junta los datos y calcula el nivel. */
export async function verificarReporte(reporte: ReporteAVerificar): Promise<ResultadoConfianza> {
  const parametros = await repositorio.leerParametros();
  const [reputacion, fotoParecida] = await Promise.all([
    repositorio.leerReputacion(reporte.usuarioId),
    reporte.hashPerceptual
      ? repositorio.buscarFotoRepetida({
          hash: reporte.hashPerceptual,
          usuarioId: reporte.usuarioId,
          hammingMax: parametros.hammingDuplicadoMax,
        })
      : null,
  ]);
  return calcularConfianza({ ...reporte, reputacion, fotoParecida }, parametros);
}
