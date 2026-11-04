/** Qué pasó con un reporte (enum `estado_verificacion`). */
export type EstadoVerificacion = 'PENDIENTE_REVISION' | 'VERIFICADO' | 'DESESTIMADO';

/**
 * El nombre de cada estado de un reporte, el mismo en revisión, en la ficha y en incidentes (decisión del 04/11).
 * Que lo haya publicado la IA no es otro estado: se cuenta aparte, como lo que pasó.
 */
export const ESTADOS_VERIFICACION: Record<EstadoVerificacion, string> = {
  PENDIENTE_REVISION: 'Pendiente de revisión',
  VERIFICADO: 'Verificado',
  DESESTIMADO: 'Desestimado',
};
