import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { estadoDeFila, type Decision, type EstadoFila, type Fila } from './estadoFila.js';
import type { ProcesoCola, ReportePendiente, Severidad } from './tipos.js';
import type { useRevision } from './useRevision.js';

interface Props {
  consulta: ReturnType<typeof useRevision>['pendientes'];
  /** El procesamiento lanzado desde esta pantalla: sus pasos se muestran en cada fila. */
  proceso: ProcesoCola | undefined;
  enCurso: boolean;
  /** Las decisiones tomadas a mano desde esta pantalla. */
  decisiones: Map<number, Decision>;
  procesando: boolean;
  errorAlProcesar: unknown;
  alProcesar: () => void;
  /** Saca de la lista lo resuelto y olvida el procesamiento y las decisiones de esta pantalla. */
  alLimpiar: () => void;
  alRevisar: (id: number) => void;
  alVerReporte: (incidenteId: number) => void;
}

/**
 * Los pendientes del organismo y su procesamiento con IA en el mismo lugar: cada fila muestra en qué está, y
 * las que se resuelven (por la IA o a mano) se quedan en la lista hasta «Limpiar resueltos».
 */
export function SeccionPendientes(props: Props) {
  const { consulta, proceso, enCurso, decisiones } = props;
  // Las filas se acumulan: un reporte que deja de estar pendiente sigue a la vista con su estado final.
  // Se ajustan al llegar una lista nueva, durante el render (el patrón de React para derivar de una prop).
  const [filas, setFilas] = useState<ReportePendiente[]>([]);
  const [listaVista, setListaVista] = useState<ReportePendiente[] | undefined>(undefined);
  if (consulta.data !== listaVista) {
    setListaVista(consulta.data);
    if (consulta.data) setFilas(sumar(filas, consulta.data));
  }

  const pendientesAhora = new Set(consulta.data?.map((reporte) => reporte.id) ?? []);
  const estados = filas.map((reporte) => ({
    reporte,
    fila: estadoDeFila(reporte, {
      pendiente: pendientesAhora.has(reporte.id),
      eventos: proceso?.eventos.filter((evento) => evento.reporte.id === reporte.id) ?? [],
      decision: decisiones.get(reporte.id),
      enCurso,
    }),
  }));
  const porDecidir = estados.filter(({ fila }) => !fila.resuelta).length;
  const resueltas = estados.length - porDecidir;

  function limpiar() {
    setFilas(consulta.data ?? []);
    props.alLimpiar();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-texto">Pendientes de aprobación</h2>
          <p className="text-xs text-texto-secundario">
            Revisalos uno por uno, o procesalos con la IA: publica los que coinciden con lo que eligió el
            vecino y deja el resto para revisión manual.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={limpiar}
            disabled={enCurso || resueltas === 0}
            className="rounded-md border border-borde px-3 py-2 text-sm font-semibold text-texto hover:bg-superficie-alterna disabled:cursor-not-allowed disabled:opacity-50"
          >
            Limpiar resueltos{resueltas ? ` (${resueltas})` : ''}
          </button>
          <button
            type="button"
            onClick={props.alProcesar}
            disabled={enCurso || props.procesando || pendientesAhora.size === 0}
            className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCurso
              ? 'Procesando con IA…'
              : `Procesar con IA${pendientesAhora.size ? ` (${pendientesAhora.size})` : ''}`}
          </button>
        </div>
      </div>

      {props.errorAlProcesar != null && <AvisoError error={aErrorApi(props.errorAlProcesar)} />}
      {enCurso && proceso && (
        <BarraProgreso hechos={proceso.resumen.procesados} total={proceso.resumen.total} />
      )}

      {consulta.isPending && <Cargando />}
      {consulta.isError && (
        <AvisoError error={aErrorApi(consulta.error)} alReintentar={() => void consulta.refetch()} />
      )}
      {consulta.data && estados.length === 0 && (
        <p className="text-sm text-texto-secundario">No hay reportes esperando aprobación.</p>
      )}

      <ul className="flex flex-col gap-2">
        {estados.map(({ reporte, fila }) => (
          <FilaPendiente
            key={reporte.id}
            reporte={reporte}
            fila={fila}
            alRevisar={() => props.alRevisar(reporte.id)}
            alVerReporte={props.alVerReporte}
          />
        ))}
      </ul>
    </div>
  );
}

function BarraProgreso({ hechos, total }: { hechos: number; total: number }) {
  const porcentaje = total === 0 ? 0 : Math.round((hechos / total) * 100);
  return (
    <div className="flex items-center gap-3 text-xs text-texto-secundario">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-alterna">
        <div
          className="h-full rounded-full bg-estado-verificado transition-all"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <span>
        La IA revisó {hechos} de {total}
      </span>
    </div>
  );
}

function FilaPendiente({
  reporte,
  fila,
  alRevisar,
  alVerReporte,
}: {
  reporte: ReportePendiente;
  fila: Fila;
  alRevisar: () => void;
  alVerReporte: (incidenteId: number) => void;
}) {
  const categorias = useCategorias();
  const foto = reporte.fotos[0];
  const { propuesta } = fila;
  const coincide =
    propuesta !== null &&
    propuesta.categoriaId === reporte.categoria.id &&
    propuesta.severidad === reporte.severidadDeclarada;
  const nombrePropuesta =
    propuesta?.categoriaId != null
      ? (categorias.data?.find((c) => c.id === propuesta.categoriaId)?.nombre ??
        `Categoría ${propuesta.categoriaId}`)
      : null;
  const enProceso = fila.estado === 'EN_PROCESO' || fila.estado === 'CLASIFICADO';

  return (
    <li
      className={`flex gap-3 rounded-md border p-2 transition-colors ${
        enProceso ? 'border-estado-verificado' : 'border-borde'
      } ${fila.resuelta ? 'bg-superficie-alterna' : ''}`}
    >
      {foto ? (
        <FotoConSesion
          fotoId={foto.id}
          className={`h-20 w-28 shrink-0 rounded object-cover ${fila.resuelta ? 'opacity-70' : ''}`}
          siFalla={<span className="h-20 w-28 shrink-0 rounded bg-superficie-alterna" />}
        />
      ) : (
        <span className="h-20 w-28 shrink-0 rounded bg-superficie-alterna" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-semibold text-texto">
          #{reporte.id} · {reporte.categoria.nombre}
        </p>
        <p className="text-xs text-texto-secundario">
          {GRAVEDADES[reporte.severidadDeclarada]} · confianza {reporte.nivelConfianza} ·{' '}
          {reporte.direccion ?? 'dirección pendiente'}
        </p>
        {reporte.descripcion && <p className="line-clamp-1 text-xs text-texto">{reporte.descripcion}</p>}
        {propuesta && (
          <p className="text-xs">
            <span className="text-texto-secundario">IA: </span>
            <span className="text-texto">
              {nombrePropuesta ?? '—'}
              {propuesta.severidad ? ` · ${GRAVEDADES[propuesta.severidad]}` : ''}
            </span>{' '}
            <span className={`font-semibold ${coincide ? 'text-estado-resuelto' : 'text-estado-registrado'}`}>
              {coincide ? '✓ coincide' : '≠ no coincide'}
            </span>
            {propuesta.explicacion && (
              <span className="block truncate text-texto-secundario" title={propuesta.explicacion}>
                {propuesta.explicacion}
              </span>
            )}
          </p>
        )}
        {fila.estado === 'ERROR' && fila.detalle && (
          <p className="truncate text-xs text-peligro" title={fila.detalle}>
            {fila.detalle}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <span className="text-xs text-texto-secundario">
          {new Date(reporte.registradoEn).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <Etiqueta estado={fila.estado} />
        {fila.revisable && (
          <button
            type="button"
            onClick={alRevisar}
            className="text-sm font-semibold text-primario hover:opacity-80"
          >
            Revisar →
          </button>
        )}
        {(fila.estado === 'PUBLICADO_IA' || fila.estado === 'APROBADO') && fila.incidenteId !== null && (
          <button
            type="button"
            onClick={() => alVerReporte(fila.incidenteId!)}
            className="text-sm text-primario underline hover:opacity-80"
          >
            ver reporte
          </button>
        )}
      </div>
    </li>
  );
}

const ETIQUETAS: Record<EstadoFila, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'bg-superficie-alterna text-texto-secundario' },
  EN_PROCESO: { texto: 'Evaluando con IA…', clase: 'bg-estado-verificado text-sobre-primario animate-pulse' },
  CLASIFICADO: { texto: 'Clasificado', clase: 'bg-estado-verificado text-sobre-primario' },
  PUBLICADO_IA: { texto: 'Publicado por la IA', clase: 'bg-estado-resuelto text-sobre-primario' },
  REVISION_MANUAL: { texto: 'Para revisión manual', clase: 'bg-estado-registrado text-sobre-primario' },
  ERROR: { texto: 'Error de la IA', clase: 'bg-peligro text-sobre-primario' },
  APROBADO: { texto: 'Aprobado a mano', clase: 'bg-estado-resuelto text-sobre-primario' },
  DESESTIMADO: { texto: 'Desestimado', clase: 'bg-estado-desestimado text-sobre-primario' },
  RESUELTO: { texto: 'Resuelto', clase: 'bg-estado-desestimado text-sobre-primario' },
};

function Etiqueta({ estado }: { estado: EstadoFila }) {
  const { texto, clase } = ETIQUETAS[estado];
  return (
    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${clase}`}>{texto}</span>
  );
}

const GRAVEDADES: Record<Severidad, string> = { LEVE: 'Leve', MODERADA: 'Moderada', GRAVE: 'Grave' };

/** Las filas que ya estaban, actualizadas con la lista nueva y con los pendientes que llegaron, en orden. */
function sumar(actuales: ReportePendiente[], nuevos: ReportePendiente[]) {
  const porId = new Map(actuales.map((fila) => [fila.id, fila]));
  for (const reporte of nuevos) porId.set(reporte.id, reporte);
  return [...porId.values()].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn) || a.id - b.id);
}
