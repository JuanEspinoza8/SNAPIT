import type { ResultadoComparacion } from '@prisma/client';

/** Lo que respondió la IA al comparar las fotos del antes con la del después. */
export type VeredictoCierre = 'RESUELTO' | 'NO_RESUELTO' | 'NO_CONCLUYENTE';

/** Parámetros cierre.* (parametro_sistema). Los valores están explicados en docs/calculos.md. */
export interface ParametrosCierre {
  distanciaMaxM: number;
}

/**
 * Resultado del cierre (F09) según la distancia entre la foto del después y el incidente y el veredicto de la
 * IA. `distancia` es null si la foto no trae GPS y `veredicto` es null si la IA no respondió. El orden de las
 * reglas es el de la issue: la primera que se cumple decide.
 */
export function decidirCierre(
  distancia: number | null,
  veredicto: VeredictoCierre | null,
  parametros: ParametrosCierre,
): ResultadoComparacion {
  if (distancia === null) return 'OBSERVADO';
  if (distancia > parametros.distanciaMaxM) return 'RECHAZADO';
  if (veredicto === null) return 'OBSERVADO';
  if (veredicto === 'RESUELTO') return 'VALIDADO';
  if (veredicto === 'NO_RESUELTO') return 'RECHAZADO';
  return 'OBSERVADO';
}
