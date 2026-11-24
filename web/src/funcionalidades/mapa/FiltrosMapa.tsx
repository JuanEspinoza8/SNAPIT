import type { ReactNode } from 'react';
import type { Categoria } from '../../compartido/catalogo/categorias.js';
import { ESTADOS, ORDEN_ESTADOS } from './estados.js';
import type { FiltrosMapa as Filtros } from './tipos.js';

interface Props {
  filtros: Filtros;
  categorias: Categoria[];
  alCambiar: (filtros: Filtros) => void;
  /** Lo que va a la derecha de la barra: cuántos incidentes hay en la zona. */
  resumen: ReactNode;
}

const campo = 'rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm text-texto';

/**
 * La barra de filtros del mapa, en una tarjeta. Los estados son botones con el color de su marcador: filtran al
 * tocarlos (otra vez, se quita el filtro) y sirven también de referencia de qué color es cada estado.
 */
export function FiltrosMapa({ filtros, categorias, alCambiar, resumen }: Props) {
  const hayFiltros = Object.values(filtros).some((valor) => valor !== undefined);

  return (
    <form
      aria-label="Filtros del mapa"
      className="tarjeta flex flex-col gap-3 p-3"
      onSubmit={(evento) => evento.preventDefault()}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-texto-secundario">
          Categoría
          <select
            className={campo}
            value={filtros.categoriaId ?? ''}
            onChange={(evento) =>
              alCambiar({
                ...filtros,
                categoriaId: evento.target.value ? Number(evento.target.value) : undefined,
              })
            }
          >
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-texto-secundario">
          Desde
          <input
            type="date"
            className={campo}
            value={filtros.desde ?? ''}
            max={filtros.hasta}
            onChange={(evento) => alCambiar({ ...filtros, desde: evento.target.value || undefined })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-texto-secundario">
          Hasta
          <input
            type="date"
            className={campo}
            value={filtros.hasta ?? ''}
            min={filtros.desde}
            onChange={(evento) => alCambiar({ ...filtros, hasta: evento.target.value || undefined })}
          />
        </label>

        <div className="ml-auto flex items-center gap-2 self-center">
          {resumen}
          {hayFiltros && (
            <button
              type="button"
              onClick={() => alCambiar({})}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-primario hover:bg-superficie"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Estado</legend>
        <span aria-hidden="true" className="text-sm text-texto-secundario">
          Estado
        </span>
        {ORDEN_ESTADOS.map((estado) => {
          const elegido = filtros.estado === estado;
          return (
            <button
              key={estado}
              type="button"
              aria-pressed={elegido}
              onClick={() => alCambiar({ ...filtros, estado: elegido ? undefined : estado })}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                elegido
                  ? 'border-primario bg-superficie font-semibold text-texto'
                  : 'border-borde-tarjeta text-texto-secundario hover:bg-superficie hover:text-texto'
              }`}
            >
              <span
                aria-hidden="true"
                className={`marcador-punto marcador-punto--chico ${ESTADOS[estado].clase}${
                  estado === 'REGISTRADO' ? ' marcador-punto--revision' : ''
                }`}
              />
              {ESTADOS[estado].etiqueta}
            </button>
          );
        })}
      </fieldset>
    </form>
  );
}
