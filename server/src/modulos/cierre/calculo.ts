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

/** Lo que se sabe del intento de cierre para explicar su resultado. */
export interface DatosDelCierre {
  distancia: number | null;
  /** Lo que dijo la IA, o null si no se le preguntó o no respondió. */
  comparacion: { veredicto: VeredictoCierre; explicacion: string } | null;
  /** Por qué no hay comparación, si la distancia ya permitía preguntarle a la IA. */
  sinComparacion: string | null;
}

const metros = (valor: number) => `${Math.round(valor)} m`;

/**
 * El texto que queda en cierre_incidente.detalle_comparacion y en la bitácora: por qué el cierre quedó como
 * quedó, para que el operador sepa qué corregir o qué confirmar. Sigue el mismo orden que decidirCierre.
 */
export function explicarCierre(
  resultado: ResultadoComparacion,
  datos: DatosDelCierre,
  parametros: ParametrosCierre,
): string {
  const { distancia, comparacion, sinComparacion } = datos;
  if (distancia === null) {
    return 'La foto no trae la ubicación donde se sacó: no se puede comprobar que sea del mismo lugar. Queda a la espera de que otro operador lo confirme.';
  }
  if (distancia > parametros.distanciaMaxM) {
    return `La foto se sacó a ${metros(distancia)} del incidente, y el máximo es ${metros(parametros.distanciaMaxM)}: tiene que ser del mismo lugar.`;
  }
  const lugar = `La foto es del lugar (a ${metros(distancia)}).`;
  if (!comparacion) {
    return `${lugar} No se pudo comparar con el antes (${sinComparacion ?? 'la IA no respondió'}): queda a la espera de que otro operador lo confirme.`;
  }
  const veredicto = {
    VALIDADO: 'La comparación con el antes dice que está resuelto',
    RECHAZADO: 'La comparación con el antes dice que el problema sigue',
    OBSERVADO:
      'La comparación con el antes no es concluyente: queda a la espera de que otro operador lo confirme',
  }[resultado];
  return `${lugar} ${veredicto}. ${comparacion.explicacion}`;
}
