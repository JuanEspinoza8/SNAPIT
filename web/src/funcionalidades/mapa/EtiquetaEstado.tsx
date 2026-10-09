import { ESTADOS } from './estados.js';
import type { EstadoVisible } from './tipos.js';

/** El estado escrito, con su color de fondo. */
export function EtiquetaEstado({ estado }: { estado: EstadoVisible }) {
  const { etiqueta, clase } = ESTADOS[estado];
  return (
    <span className={`${clase} rounded-md px-2 py-0.5 text-xs font-semibold text-sobre-primario`}>
      {etiqueta}
    </span>
  );
}
