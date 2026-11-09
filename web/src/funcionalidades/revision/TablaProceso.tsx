import { Fragment, useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { agruparPorReporte, type ReporteProcesado } from './agrupar.js';
import {
  severidadEnTexto,
  type EstadoEvento,
  type EventoCola,
  type ProcesoCola,
  type Severidad,
} from './tipos.js';

/** La propuesta se abre con el último paso del reporte: es el que dice si la IA lo publicó o no, y por qué. */
export type Seleccion =
  | { tipo: 'propuesta'; evento: EventoCola; ultimo: EventoCola }
  | { tipo: 'ficha'; incidenteId: number }
  | null;

interface Props {
  proceso: ProcesoCola | undefined;
  cargando: boolean;
  error: unknown;
  alReintentar: () => void;
  alElegir: (seleccion: Seleccion) => void;
}

/** El procesamiento con IA como tabla: una fila por reporte, con su historial de estados desplegable. */
export function TablaProceso({ proceso, cargando, error, alReintentar, alElegir }: Props) {
  const categorias = useCategorias();
  const nombreCategoria = (id: number | null) =>
    id === null ? null : (categorias.data?.find((c) => c.id === id)?.nombre ?? `Categoría ${id}`);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  function alternar(id: number) {
    setAbiertos((actuales) => {
      const nuevos = new Set(actuales);
      if (nuevos.has(id)) nuevos.delete(id);
      else nuevos.add(id);
      return nuevos;
    });
  }

  const filas = proceso ? agruparPorReporte(proceso.eventos) : [];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-texto">Procesamiento con IA</h2>
        {proceso && (
          <span className="text-xs text-texto-secundario">
            Iniciado a las {hora(proceso.iniciadoEn)}
            {proceso.enCurso && ' · en curso…'}
          </span>
        )}
      </div>

      {cargando && <Cargando />}
      {error != null && <AvisoError error={aErrorApi(error)} alReintentar={alReintentar} />}
      {!proceso && !cargando && error == null && (
        <p className="text-sm text-texto-secundario">
          Todavía no se procesó la cola. Apretá «Procesar con IA» para verlo en vivo.
        </p>
      )}

      {proceso && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-borde text-xs uppercase tracking-wide text-texto-secundario">
                  <th className="py-2 pr-3">Reporte</th>
                  <th className="py-2 pr-3">El vecino eligió</th>
                  <th className="py-2 pr-3">La IA propone</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Hora</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <Fragment key={fila.reporte.id}>
                    <FilaReporte
                      fila={fila}
                      abierto={abiertos.has(fila.reporte.id)}
                      nombreCategoria={nombreCategoria}
                      alAlternar={() => alternar(fila.reporte.id)}
                      alElegir={alElegir}
                    />
                    {abiertos.has(fila.reporte.id) && <Historial eventos={fila.eventos} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Resumen proceso={proceso} />
        </>
      )}
    </div>
  );
}

function FilaReporte({
  fila,
  abierto,
  nombreCategoria,
  alAlternar,
  alElegir,
}: {
  fila: ReporteProcesado;
  abierto: boolean;
  nombreCategoria: (id: number | null) => string | null;
  alAlternar: () => void;
  alElegir: (seleccion: Seleccion) => void;
}) {
  const { reporte, propuesta } = fila;
  const coincide =
    propuesta !== null &&
    propuesta.categoriaId === reporte.categoria.id &&
    propuesta.severidad === reporte.severidadDeclarada;
  const clasificado = fila.eventos.find((evento) => evento.estado === 'CLASIFICADO');
  const enlace = 'text-primario underline hover:opacity-80';

  return (
    <tr className={`border-b border-borde align-middle ${abierto ? 'bg-superficie-alterna' : ''}`}>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          {reporte.foto ? (
            <FotoConSesion
              fotoId={reporte.foto.id}
              className="h-10 w-14 shrink-0 rounded-md object-cover"
              siFalla={<span className="h-10 w-14 shrink-0 rounded-md bg-superficie-alterna" />}
            />
          ) : (
            <span className="h-10 w-14 shrink-0 rounded-md bg-superficie-alterna" />
          )}
          <span className="font-semibold text-texto">#{reporte.id}</span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <Clasificacion categoria={reporte.categoria.nombre} severidad={reporte.severidadDeclarada} />
      </td>
      <td className="py-2 pr-3">
        {propuesta ? (
          <div className="flex flex-col">
            <Clasificacion
              categoria={nombreCategoria(propuesta.categoriaId)}
              severidad={propuesta.severidad}
            />
            <span className="text-xs font-semibold text-texto">{coincide ? 'Coincide' : 'No coincide'}</span>
          </div>
        ) : (
          <span className="text-texto-secundario">—</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <EtiquetaEstado estado={fila.estado} />
      </td>
      <td className="py-2 pr-3 text-xs text-texto-secundario">{hora(fila.ultimoEvento)}</td>
      <td className="py-2 text-right">
        <div className="flex justify-end gap-3 whitespace-nowrap">
          <button
            type="button"
            className={enlace}
            onClick={alAlternar}
            aria-expanded={abierto}
            aria-label={`${abierto ? 'Ocultar' : 'Ver'} historial del reporte #${reporte.id}`}
          >
            {abierto ? 'ocultar historial' : 'ver historial'}
          </button>
          {clasificado && (
            <button
              type="button"
              className={enlace}
              onClick={() =>
                alElegir({ tipo: 'propuesta', evento: clasificado, ultimo: fila.eventos.at(-1)! })
              }
            >
              ver propuesta
            </button>
          )}
          {fila.estado === 'PUBLICADO' && reporte.incidenteId !== null && (
            <button
              type="button"
              className={enlace}
              onClick={() => alElegir({ tipo: 'ficha', incidenteId: reporte.incidenteId! })}
            >
              ver reporte
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Los pasos de un reporte, uno debajo del otro, con su hora y su detalle. */
function Historial({ eventos }: { eventos: EventoCola[] }) {
  return (
    <tr className="border-b border-borde bg-superficie-alterna">
      <td colSpan={6} className="pb-3 pr-3">
        <ol className="relative ml-2 flex flex-col gap-2 border-l-2 border-borde pl-4">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-texto-secundario">{hora(evento.creadoEn)}</span>
                <EtiquetaEstado estado={evento.estado} />
              </div>
              {evento.detalle && <p className="text-xs text-texto-secundario">{evento.detalle}</p>}
            </li>
          ))}
        </ol>
      </td>
    </tr>
  );
}

// Con colores neutros, como en «Pendientes de aprobación»: el texto dice en qué está.
const ETIQUETAS: Record<EstadoEvento, string> = {
  EN_PROCESO: 'En proceso',
  CLASIFICADO: 'Clasificado',
  PUBLICADO: 'Publicado por la IA',
  REVISION_MANUAL: 'Revisión manual',
  ERROR: 'Error',
};

function EtiquetaEstado({ estado }: { estado: EstadoEvento }) {
  const clase =
    estado === 'ERROR'
      ? 'border-peligro bg-peligro text-sobre-primario'
      : 'border-borde bg-superficie-alterna text-texto';
  return (
    <span className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${clase}`}>
      {ETIQUETAS[estado]}
    </span>
  );
}

function Clasificacion({ categoria, severidad }: { categoria: string | null; severidad: Severidad | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-texto">{categoria ?? '—'}</span>
      {severidad && <span className="text-xs text-texto-secundario">{severidadEnTexto[severidad]}</span>}
    </div>
  );
}

const decimales = (valor: number, cantidad: number) =>
  valor.toLocaleString('es-AR', { minimumFractionDigits: cantidad, maximumFractionDigits: cantidad });

function Resumen({ proceso }: { proceso: ProcesoCola }) {
  const r = proceso.resumen;
  // Si el vecino había aceptado la sugerencia, la IA coincidió consigo misma: se aclara cuántos fueron.
  const datos: [string, string, string?][] = [
    ['Procesados', `${r.procesados} de ${r.total}`],
    [
      'Publicados',
      String(r.publicados),
      r.publicadosConSugerencia > 0 ? `${r.publicadosConSugerencia} con la sugerencia aceptada` : undefined,
    ],
    ['A revisión', String(r.derivados)],
    ['Errores', String(r.errores)],
    ['Tiempo medio', r.tiempoMedioMs === null ? '—' : `${decimales(r.tiempoMedioMs / 1000, 1)} s`],
    ['Costo', r.costoUsd === null ? '—' : `US$ ${decimales(r.costoUsd, 4)}`],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-md bg-superficie-alterna p-3 text-center sm:grid-cols-6">
      {datos.map(([titulo, valor, nota]) => (
        <div key={titulo}>
          <dt className="text-xs text-texto-secundario">{titulo}</dt>
          <dd className="font-semibold text-texto">{valor}</dd>
          {nota && <dd className="text-xs text-texto-secundario">{nota}</dd>}
        </div>
      ))}
    </dl>
  );
}

function hora(fecha: string) {
  return new Date(fecha).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
