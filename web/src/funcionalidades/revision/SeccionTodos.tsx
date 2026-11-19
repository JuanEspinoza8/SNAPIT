import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { ESTADOS_VERIFICACION } from '../../compartido/formato/verificacion.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { Etiqueta, fechaCorta, Lista, Miniatura, Vacio } from './piezas.js';
import { severidadEnTexto, type EstadoVerificacion, type ReporteDelOrganismo } from './tipos.js';
import type { useRevision } from './useRevision.js';

type Filtro = 'TODOS' | EstadoVerificacion;

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'TODOS', texto: 'Todos' },
  { valor: 'PENDIENTE_REVISION', texto: 'Pendientes' },
  { valor: 'VERIFICADO', texto: 'Verificados' },
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
    deLaCategoria.filter((reporte) => valor === 'TODOS' || reporte.estadoVerificacion === valor).length;
  const visibles = deLaCategoria.filter(
    (reporte) => filtro === 'TODOS' || reporte.estadoVerificacion === filtro,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Botones que se marcan, no pestañas: filtran la misma lista. */}
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
          {FILTROS.map(({ valor, texto }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
              className={`rounded-full px-3 py-1 text-sm ${
                filtro === valor
                  ? 'bg-superficie-alterna font-semibold text-texto'
                  : 'text-texto-secundario hover:text-texto'
              }`}
            >
              {texto}{' '}
              <span className="text-xs text-texto-secundario">{consulta.data ? cuantos(valor) : '…'}</span>
            </button>
          ))}
        </div>
        <select
          aria-label="Categoría"
          value={categoriaId ?? ''}
          onChange={(evento) => setCategoriaId(evento.target.value ? Number(evento.target.value) : null)}
          className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm text-texto"
        >
          <option value="">Todas las categorías</option>
          {categorias.data?.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </select>
      </div>

      {consulta.isPending && <Cargando />}
      {consulta.isError && (
        <AvisoError error={aErrorApi(consulta.error)} alReintentar={() => void consulta.refetch()} />
      )}
      {consulta.data && visibles.length === 0 && <Vacio>No hay reportes con estos filtros.</Vacio>}

      <Lista>
        {visibles.map((reporte) => (
          <li key={reporte.id}>
            <button
              type="button"
              onClick={() => alAbrir(reporte)}
              className="flex w-full items-center gap-3 py-3 text-left hover:bg-superficie-alterna"
            >
              <Miniatura fotoId={reporte.fotos[0]?.id} />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-sm font-semibold text-texto">
                  {reporte.categoria.nombre} · {severidadEnTexto[reporte.severidadDeclarada]}
                </p>
                <p className="truncate text-xs text-texto-secundario">
                  #{reporte.id} · {reporte.direccion ?? 'Dirección pendiente'} ·{' '}
                  {fechaCorta(reporte.registradoEn)}
                </p>
              </div>
              <EstadoReporte reporte={reporte} />
            </button>
          </li>
        ))}
      </Lista>
    </div>
  );
}

/** El estado del reporte, con el mismo nombre que en la ficha, y quién lo decidió si fue la IA. */
export function EstadoReporte({ reporte }: { reporte: ReporteDelOrganismo }) {
  if (reporte.marcadoParaDesestimar) return <Etiqueta punto="bg-peligro">Para desestimar</Etiqueta>;
  return (
    <Etiqueta>
      {ESTADOS_VERIFICACION[reporte.estadoVerificacion]}
      {reporte.publicadoPorIaEn && <span className="font-normal text-texto-secundario">por la IA</span>}
    </Etiqueta>
  );
}
