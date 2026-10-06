import { ESTADOS, ORDEN_ESTADOS } from './estados.js';
import type { Categoria, EstadoVisible, FiltrosMapa as Filtros } from './tipos.js';

interface Props {
  filtros: Filtros;
  categorias: Categoria[];
  alCambiar: (filtros: Filtros) => void;
}

const campo = 'rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm text-texto';

export function FiltrosMapa({ filtros, categorias, alCambiar }: Props) {
  const hayFiltros = Object.values(filtros).some((valor) => valor !== undefined);

  return (
    <form
      aria-label="Filtros del mapa"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(evento) => evento.preventDefault()}
    >
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
        Estado
        <select
          className={campo}
          value={filtros.estado ?? ''}
          onChange={(evento) =>
            alCambiar({ ...filtros, estado: (evento.target.value || undefined) as EstadoVisible | undefined })
          }
        >
          <option value="">Todos</option>
          {ORDEN_ESTADOS.map((estado) => (
            <option key={estado} value={estado}>
              {ESTADOS[estado].etiqueta}
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

      {hayFiltros && (
        <button
          type="button"
          onClick={() => alCambiar({})}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-primario hover:bg-superficie-alterna"
        >
          Limpiar filtros
        </button>
      )}
    </form>
  );
}
