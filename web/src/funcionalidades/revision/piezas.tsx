import type { ReactNode } from 'react';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import type { EstadoIa } from './estadoIa.js';

/** La primera foto del reporte, chica. Sin foto (o si no se puede bajar), un recuadro vacío del mismo tamaño. */
export function Miniatura({ fotoId, tenue = false }: { fotoId: number | undefined; tenue?: boolean }) {
  const vacia = <span className="h-14 w-20 shrink-0 rounded-md bg-superficie-alterna" />;
  if (fotoId === undefined) return vacia;
  return (
    <FotoConSesion
      fotoId={fotoId}
      className={`h-14 w-20 shrink-0 rounded-md object-cover ${tenue ? 'opacity-60' : ''}`}
      siFalla={vacia}
    />
  );
}

// El texto dice en qué está; el punto de color solo ayuda a encontrarlo de un vistazo.
const ESTADOS_IA: Record<EstadoIa, { texto: string; punto: string }> = {
  EN_COLA: { texto: 'En cola', punto: 'bg-borde' },
  ANALIZANDO: { texto: 'Analizando…', punto: 'bg-primario animate-pulse' },
  PUBLICADO: { texto: 'Publicado', punto: 'bg-estado-resuelto' },
  REVISAR: { texto: 'Para revisar', punto: 'bg-estado-registrado' },
  DESESTIMAR: { texto: 'Para desestimar', punto: 'bg-peligro' },
  ERROR: { texto: 'Error de la IA', punto: 'bg-peligro' },
};

export function EtiquetaIa({ estado }: { estado: EstadoIa }) {
  const { texto, punto } = ESTADOS_IA[estado];
  return <Etiqueta punto={punto}>{texto}</Etiqueta>;
}

export function Etiqueta({ punto, children }: { punto?: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-borde px-2 py-0.5 text-xs font-semibold text-texto">
      {punto && <span aria-hidden className={`h-2 w-2 rounded-full ${punto}`} />}
      {children}
    </span>
  );
}

/** Una lista de reportes: filas con fondo alterno (.lista-filas), para seguir cada una. */
export function Lista({ children }: { children: ReactNode }) {
  return <ul className="lista-filas">{children}</ul>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-texto-secundario">{children}</p>;
}

export const fechaCorta = (fecha: string) =>
  new Date(fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

const decimales = (valor: number, cantidad: number) =>
  valor.toLocaleString('es-AR', { minimumFractionDigits: cantidad, maximumFractionDigits: cantidad });

export const segundos = (ms: number) => `${decimales(ms / 1000, 1)} s`;
export const dolares = (usd: number) => `US$ ${decimales(usd, 4)}`;

export const botonPrimario =
  'rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
export const botonSecundario =
  'rounded-md border border-borde px-3 py-2 text-sm font-semibold text-texto hover:bg-superficie-alterna disabled:cursor-not-allowed disabled:opacity-50';
export const botonPeligro =
  'rounded-md border border-peligro px-3 py-2 text-sm font-semibold text-peligro hover:bg-superficie-alterna disabled:cursor-not-allowed disabled:opacity-50';
export const enlace = 'text-sm font-semibold text-primario hover:opacity-80';
