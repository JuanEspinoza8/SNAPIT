import type { EstadoIncidente } from '@prisma/client';

/**
 * Quién hace el cambio de estado:
 * - OPERADOR: una acción del operador sobre el incidente (derivar, pasar a ejecución, desestimar).
 * - REPORTES: la regla de estado según los reportes (estadoSegunReportes), al revisar, unir o separar.
 * - CIERRE: el cierre con la foto del después (corte 75 %).
 */
export type ViaTransicion = 'OPERADOR' | 'REPORTES' | 'CIERRE';

/**
 * El diagrama de estados del incidente (§6 del plan): desde cada estado, a cuál se puede pasar y por qué vía.
 * RESUELTO y DESESTIMADO no tienen salida. DERIVADO → DERIVADO es re-derivar a otra área.
 */
const TRANSICIONES: Record<EstadoIncidente, Partial<Record<EstadoIncidente, ViaTransicion[]>>> = {
  REGISTRADO: { VERIFICADO: ['REPORTES'], DESESTIMADO: ['REPORTES', 'OPERADOR'] },
  // A REGISTRADO vuelve solo cuando se le separa o desune el único reporte verificado (decisión del 21/10).
  VERIFICADO: { REGISTRADO: ['REPORTES'], DERIVADO: ['OPERADOR'], DESESTIMADO: ['REPORTES', 'OPERADOR'] },
  DERIVADO: { DERIVADO: ['OPERADOR'], EN_EJECUCION: ['OPERADOR'], DESESTIMADO: ['OPERADOR'] },
  EN_EJECUCION: { RESUELTO: ['CIERRE'], DESESTIMADO: ['OPERADOR'] },
  RESUELTO: {},
  DESESTIMADO: {},
};

/** Si el incidente puede pasar de `desde` a `hacia` por esa vía. */
export function transicionValida(desde: EstadoIncidente, hacia: EstadoIncidente, via: ViaTransicion) {
  return TRANSICIONES[desde][hacia]?.includes(via) ?? false;
}
