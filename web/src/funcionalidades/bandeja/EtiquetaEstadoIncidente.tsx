import { ESTADOS } from '../mapa/estados.js';
import type { EstadoIncidente } from './tipos.js';

// Los del mapa más DESESTIMADO, que el mapa no muestra y el operador sí. Mismos textos que el mapa.
export const ESTADOS_INCIDENTE: Record<EstadoIncidente, { etiqueta: string; clase: string }> = {
  ...ESTADOS,
  DESESTIMADO: { etiqueta: 'Desestimado', clase: 'bg-estado-desestimado' },
};

/** El estado escrito, con su color de fondo: el color solo no alcanza. */
export function EtiquetaEstadoIncidente({ estado }: { estado: EstadoIncidente }) {
  const { etiqueta, clase } = ESTADOS_INCIDENTE[estado];
  return (
    <span
      className={`${clase} whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold text-sobre-primario`}
    >
      {etiqueta}
    </span>
  );
}
