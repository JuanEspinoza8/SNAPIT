import type { EstadoVisible } from './tipos.js';

/**
 * Cada estado tiene un texto además del color: el color solo no alcanza para quien no distingue
 * colores, ni para un lector de pantalla. `clase` es el color de fondo, de los tokens de tema.css.
 */
export const ESTADOS: Record<EstadoVisible, { etiqueta: string; clase: string }> = {
  REGISTRADO: { etiqueta: 'En revisión', clase: 'bg-estado-registrado' },
  VERIFICADO: { etiqueta: 'Verificado', clase: 'bg-estado-verificado' },
  DERIVADO: { etiqueta: 'Derivado al área', clase: 'bg-estado-derivado' },
  EN_EJECUCION: { etiqueta: 'En ejecución', clase: 'bg-estado-en-ejecucion' },
  RESUELTO: { etiqueta: 'Resuelto', clase: 'bg-estado-resuelto' },
};

export const ORDEN_ESTADOS = Object.keys(ESTADOS) as EstadoVisible[];
