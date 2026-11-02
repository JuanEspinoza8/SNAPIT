import type { ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';
import { ESTADOS_INCIDENTE, EtiquetaEstadoIncidente } from './EtiquetaEstadoIncidente.js';
import { aParametros, ESTADOS_BANDEJA, leerFiltros } from './filtros.js';
import { numero } from './formato.js';
import type { EstadoBandeja, FiltrosBandeja, IncidenteBandeja } from './tipos.js';
import { useAreas, useBandeja } from './useGestion.js';

/** F08: los incidentes verificados del organismo, del más urgente al menos urgente, con sus motivos. */
export function PaginaBandeja() {
  const [parametros, setParametros] = useSearchParams();
  const filtros = leerFiltros(parametros);
  const bandeja = useBandeja(filtros);
  const { areas, categorias } = useAreas();
  const { usuario } = useSesion();
  const ubicacion = useLocation();

  // Los filtros viven en la URL: el link se puede compartir y al volver de una ficha siguen iguales.
  const filtrar = (cambios: Partial<FiltrosBandeja>) =>
    setParametros(aParametros({ ...filtros, ...cambios }), { replace: true });
  const hayFiltros = parametros.toString() !== '';
  const miArea = areas.find((area) => area.id === usuario?.areaId);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Bandeja</h1>
        <p className="text-sm text-texto-secundario">
          Los incidentes verificados de tu organismo, del más urgente al menos urgente. Manda la prioridad
          fijada a mano si la hay; si no, la que calcula el sistema.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Filtro
          id="filtro-area"
          etiqueta="Área"
          valor={filtros.areaId === undefined ? '' : String(filtros.areaId)}
          alCambiar={(valor) =>
            filtrar({ areaId: valor === '' ? undefined : valor === 'todas' ? 'todas' : Number(valor) })
          }
        >
          <option value="">{miArea ? `Mi área (${miArea.nombre})` : 'Mi área'}</option>
          <option value="todas">Todas las áreas</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.nombre}
            </option>
          ))}
        </Filtro>
        <Filtro
          id="filtro-estado"
          etiqueta="Estado"
          valor={filtros.estado ?? ''}
          alCambiar={(valor) => filtrar({ estado: (valor || undefined) as EstadoBandeja | undefined })}
        >
          <option value="">Todos</option>
          {ESTADOS_BANDEJA.map((estado) => (
            <option key={estado} value={estado}>
              {ESTADOS_INCIDENTE[estado].etiqueta}
            </option>
          ))}
        </Filtro>
        <Filtro
          id="filtro-categoria"
          etiqueta="Categoría"
          valor={filtros.categoriaId === undefined ? '' : String(filtros.categoriaId)}
          alCambiar={(valor) => filtrar({ categoriaId: valor ? Number(valor) : undefined })}
        >
          <option value="">Todas</option>
          {categorias.data?.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </Filtro>
        {hayFiltros && (
          <button
            type="button"
            onClick={() => setParametros({}, { replace: true })}
            className="rounded-md px-3 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {bandeja.isPending && <Cargando filas={5} />}
      {bandeja.isError && (
        <AvisoError
          error={aErrorApi(bandeja.error)}
          alReintentar={() => void bandeja.refetch()}
          reintentando={bandeja.isFetching}
        />
      )}
      {bandeja.data && bandeja.data.length === 0 && (
        <div className="rounded-lg border border-borde p-4 text-sm text-texto-secundario">
          <p>No hay incidentes para atender con estos filtros.</p>
          {filtros.areaId === undefined && (
            <button
              type="button"
              onClick={() => filtrar({ areaId: 'todas' })}
              className="mt-2 font-semibold text-primario hover:underline"
            >
              Ver todas las áreas
            </button>
          )}
        </div>
      )}
      {bandeja.data && bandeja.data.length > 0 && (
        <TablaBandeja incidentes={bandeja.data} desde={`${ubicacion.pathname}${ubicacion.search}`} />
      )}
    </section>
  );
}

function Filtro(props: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-semibold text-texto">
        {props.etiqueta}
      </label>
      <select
        id={props.id}
        value={props.valor}
        onChange={(evento) => props.alCambiar(evento.target.value)}
        className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm text-texto focus:border-primario focus:outline-none"
      >
        {props.children}
      </select>
    </div>
  );
}

function TablaBandeja({ incidentes, desde }: { incidentes: IncidenteBandeja[]; desde: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <caption className="sr-only">Incidentes ordenados por prioridad</caption>
        <thead className="bg-superficie-alterna text-xs text-texto-secundario">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Prioridad
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Incidente
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Estado
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Reportes
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Motivos
            </th>
          </tr>
        </thead>
        <tbody>
          {incidentes.map((incidente) => (
            <FilaBandeja key={incidente.id} incidente={incidente} desde={desde} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaBandeja({ incidente, desde }: { incidente: IncidenteBandeja; desde: string }) {
  const manual = incidente.prioridadManual;
  // Lo que suma cero no explica nada: se lee en la ficha.
  const motivos = incidente.motivos.filter((motivo) => motivo.valor !== 0);
  return (
    <tr className="border-t border-borde align-top hover:bg-superficie-alterna">
      <td className="px-3 py-3">
        <p className="text-base font-semibold text-texto">
          {numero.format(manual ?? incidente.puntajePrioridad)}
        </p>
        {manual !== null && (
          <p className="mt-1 text-xs text-texto-secundario">
            <span className="rounded border border-primario px-1 font-semibold text-primario">Manual</span>{' '}
            calculada {numero.format(incidente.puntajePrioridad)}
          </p>
        )}
      </td>
      <td className="px-3 py-3">
        <Link
          to={`/bandeja/${incidente.id}`}
          state={{ desde }}
          className="font-semibold text-primario hover:underline"
        >
          #{incidente.id} · {incidente.categoria.nombre}
        </Link>
        <p className="text-texto">{incidente.direccion ?? 'Dirección pendiente'}</p>
        <p className="text-xs text-texto-secundario">{incidente.area.nombre}</p>
      </td>
      <td className="px-3 py-3">
        <EtiquetaEstadoIncidente estado={incidente.estado} />
      </td>
      <td className="px-3 py-3 text-right text-texto">{incidente.cantidadReportes}</td>
      <td className="px-3 py-3">
        <ul className="flex flex-col gap-0.5 text-texto">
          {motivos.map((motivo) => (
            <li key={motivo.factor}>
              {motivo.detalle ?? `${motivo.factor}: ${numero.format(motivo.valor)}`}
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}
