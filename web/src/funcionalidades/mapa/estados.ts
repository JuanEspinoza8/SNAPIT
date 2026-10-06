import type { EstadoVisible } from './tipos.js';

/**
 * Cada estado tiene un texto además del color: el color solo no alcanza para quien no distingue
 * colores, ni para un lector de pantalla.
 */
export const ESTADOS: Record<EstadoVisible, { etiqueta: string; clase: string }> = {
  REGISTRADO: { etiqueta: 'En revisión', clase: 'estado-registrado' },
  VERIFICADO: { etiqueta: 'Verificado', clase: 'estado-verificado' },
  DERIVADO: { etiqueta: 'Derivado al área', clase: 'estado-derivado' },
  EN_EJECUCION: { etiqueta: 'En ejecución', clase: 'estado-en-ejecucion' },
  RESUELTO: { etiqueta: 'Resuelto', clase: 'estado-resuelto' },
};

export const ORDEN_ESTADOS = Object.keys(ESTADOS) as EstadoVisible[];
