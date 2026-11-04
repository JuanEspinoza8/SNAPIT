import type { ReactNode } from 'react';
import { ESTADOS } from './estados.js';
import type { EstadoVisible } from './tipos.js';

/**
 * Los mismos íconos que la app (mobile/lib/funcionalidades/mapa/estados.dart): reloj de arena, tilde, flecha,
 * martillo y doble tilde. Dibujados a mano, como las barras de la gravedad, para no sumar una librería por cinco
 * íconos.
 */
const TRAZOS: Record<EstadoVisible, ReactNode> = {
  REGISTRADO: <path d="M3 1.5h6M3 10.5h6M3.5 1.5c0 3 5 6 5 9M8.5 1.5c0 3-5 6-5 9" />,
  VERIFICADO: <path d="M2 6.5l2.5 2.5L10 3.5" />,
  DERIVADO: <path d="M2 6h8M6.5 2.5L10 6 6.5 9.5" />,
  EN_EJECUCION: <path d="M1.5 2.5h5v3h-5zM5 5.5l5 5" />,
  RESUELTO: <path d="M1 6.5l2.5 2.5L8 3.5M5.5 9L11 3.5" />,
};

/** El estado escrito, con su ícono y su color de fondo. */
export function EtiquetaEstado({ estado }: { estado: EstadoVisible }) {
  const { etiqueta, clase } = ESTADOS[estado];
  return (
    <span
      className={`${clase} inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-sobre-estado`}
    >
      <svg
        aria-hidden="true"
        data-icono={estado}
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
      >
        {TRAZOS[estado]}
      </svg>
      {etiqueta}
    </span>
  );
}
