import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { severidadEnTexto, type EstadoVerificacion, type ReporteDelOrganismo } from './tipos.js';
import type { useRevision } from './useRevision.js';

type Filtro = 'TODOS' | EstadoVerificacion;

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'TODOS', texto: 'Todos' },
  { valor: 'PENDIENTE_REVISION', texto: 'Pendientes' },
  { valor: 'VERIFICADO', texto: 'Publicados' },
  { valor: 'DESESTIMADO', texto: 'Desestimados' },
];

interface Props {
  consulta: ReturnType<typeof useRevision>['todos'];
  alAbrir: (reporte: ReporteDelOrganismo) => void;
}

/** Todos los reportes del organismo, en cualquier estado, con filtros por estado y categoría. */
export function SeccionTodos({ consulta, alAbrir }: Props) {
  const categorias = useCategorias();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);

  const deLaCategoria = (consulta.data ?? []).filter(
    (reporte) => categoriaId === null || reporte.categoria.id === categoriaId,
  );
  const cuantos = (valor: Filtro) =>
    valor === 'TODOS'
      ? deLaCategoria.length
      : deLaCategoria.filter((reporte) => reporte.estadoVerificacion === valor).length;
  const visibles = deLaCategoria.filter(
    (reporte) => filtro === 'TODOS' || reporte.estadoVerificacion === filtro,
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-texto">Todos los reportes</h2>
          <p className="text-xs text-texto-secundario">
            Los reportes de tu organismo en cualquier estado, del más nuevo al más viejo.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-secundario">
          Categoría
          <select
            value={categoriaId ?? ''}
            onChange={(evento) => setCategoriaId(evento.target.value ? Number(evento.target.value) : null)}
            className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm text-texto"
          >
            <option value="">Todas</option>
            {categorias.data?.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div role="tablist" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
        {FILTROS.map(({ valor, texto }) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={filtro === valor}
            onClick={() => setFiltro(valor)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              filtro === valor
                ? 'bg-superficie-alterna font-semibold text-primario'
                : 'text-texto-secundario hover:bg-superficie-alterna'
            }`}
          >
            {texto} <span className="text-xs">({consulta.data ? cuantos(valor) : '…'})</span>
          </button>
        ))}
      </div>

      {consulta.isPending && <Cargando />}
      {consulta.isError && (
        <AvisoError error={aErrorApi(consulta.error)} alReintentar={() => void consulta.refetch()} />
      )}
      {consulta.data && visibles.length === 0 && (
        <p className="text-sm text-texto-secundario">No hay reportes con estos filtros.</p>
      )}

      <ul className="flex flex-col gap-2">
        {visibles.map((reporte) => (
          <FilaReporte key={reporte.id} reporte={reporte} alAbrir={() => alAbrir(reporte)} />
        ))}
      </ul>
    </div>
  );
}

function FilaReporte({ reporte, alAbrir }: { reporte: ReporteDelOrganismo; alAbrir: () => void }) {
  const foto = reporte.fotos[0];
  return (
    <li>
      <button
        type="button"
        onClick={alAbrir}
        className="flex w-full gap-3 rounded-md border border-borde p-2 text-left hover:border-primario hover:bg-superficie-alterna"
      >
        {foto ? (
          <FotoConSesion
            fotoId={foto.id}
            className="h-16 w-24 shrink-0 rounded object-cover"
            siFalla={<span className="h-16 w-24 shrink-0 rounded bg-superficie-alterna" />}
          />
        ) : (
          <span className="h-16 w-24 shrink-0 rounded bg-superficie-alterna" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-sm font-semibold text-texto">
            #{reporte.id} · {reporte.categoria.nombre}
          </p>
          <p className="text-xs text-texto-secundario">
            {severidadEnTexto[reporte.severidadDeclarada]} · confianza {reporte.nivelConfianza} ·{' '}
            {reporte.direccion ?? 'dirección pendiente'}
          </p>
          {reporte.descripcion && <p className="line-clamp-1 text-xs text-texto">{reporte.descripcion}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-1">
          <span className="text-xs text-texto-secundario">{fechaCorta(reporte.registradoEn)}</span>
          <EtiquetaEstado reporte={reporte} />
          {reporte.publicadoPorIaEn && (
            <span className="text-xs text-texto-secundario">el {fechaCorta(reporte.publicadoPorIaEn)}</span>
          )}
        </div>
      </button>
    </li>
  );
}

/** El estado del reporte, distinguiendo los que publicó la IA. */
export function EtiquetaEstado({ reporte }: { reporte: ReporteDelOrganismo }) {
  const { texto, clase } =
    reporte.estadoVerificacion === 'PENDIENTE_REVISION'
      ? { texto: 'Pendiente', clase: 'bg-estado-registrado' }
      : reporte.estadoVerificacion === 'DESESTIMADO'
        ? { texto: 'Desestimado', clase: 'bg-estado-desestimado' }
        : reporte.publicadoPorIaEn
          ? { texto: 'Publicado por la IA', clase: 'bg-estado-resuelto' }
          : { texto: 'Publicado', clase: 'bg-estado-resuelto' };
  return (
    <span
      className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold text-sobre-primario ${clase}`}
    >
      {texto}
    </span>
  );
}

export function fechaCorta(fecha: string) {
  return new Date(fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}
