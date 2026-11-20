import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal } from '../../compartido/componentes/Modal.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { FichaIncidente } from '../mapa/FichaIncidente.js';
import { DetalleReporte } from './DetalleReporte.js';
import { enlace, fechaCorta } from './piezas.js';
import { SeccionDesestimados } from './SeccionDesestimados.js';
import { SeccionPendientes } from './SeccionPendientes.js';
import { EstadoReporte, SeccionTodos } from './SeccionTodos.js';
import type { ReporteDelOrganismo, ReportePendiente } from './tipos.js';
import { useRevision } from './useRevision.js';

type Seccion = 'pendientes' | 'desestimados' | 'todos';
const SECCIONES: Seccion[] = ['pendientes', 'desestimados', 'todos'];

/**
 * La revisión del operador (F04). Todo reporte llega pendiente: la IA mira las fotos y publica las que están
 * bien, aparta las que no muestran un problema de la vía pública y deja el resto para una persona. Tres pestañas:
 * los pendientes (con el procesamiento en vivo), los apartados por la IA y todos los reportes.
 */
export function PaginaRevision() {
  const revision = useRevision();
  const { pendientes, desestimados, todos, revisar, enCurso } = revision;
  // La pestaña va en la URL: al recargar se sigue en la misma.
  const [parametros, setParametros] = useSearchParams();
  const pedida = parametros.get('seccion') as Seccion | null;
  const seccion: Seccion = pedida && SECCIONES.includes(pedida) ? pedida : 'pendientes';
  const irA = (destino: Seccion) =>
    setParametros(destino === 'pendientes' ? {} : { seccion: destino }, { replace: true });

  // El reporte abierto se busca en las listas cada vez: así el detalle muestra siempre lo último. Si deja de
  // estar pendiente mientras está abierto (lo decidió otra persona), sigue a la vista con el aviso.
  const [abierto, setAbierto] = useState<ReportePendiente | null>(null);
  const [consultado, setConsultado] = useState<ReporteDelOrganismo | null>(null);
  const [incidenteId, setIncidenteId] = useState<number | null>(null);
  const enPendientes = pendientes.data?.find((reporte) => reporte.id === abierto?.id);
  const enDesestimados = desestimados.data?.find((reporte) => reporte.id === abierto?.id);
  const actual = enPendientes ?? enDesestimados ?? abierto;

  function abrir(reporte: ReportePendiente) {
    revisar.reset();
    setAbierto(reporte);
  }

  function abrirDeTodos(reporte: ReporteDelOrganismo) {
    const pendiente =
      pendientes.data?.find((otro) => otro.id === reporte.id) ??
      desestimados.data?.find((otro) => otro.id === reporte.id);
    if (pendiente) abrir(pendiente);
    else setConsultado(reporte);
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-texto">Revisión de reportes</h1>
        <nav aria-label="Secciones de la revisión" className="flex gap-4 border-b border-borde">
          <Pestania activa={seccion === 'pendientes'} alElegir={() => irA('pendientes')}>
            Pendientes <Cantidad valor={pendientes.data?.length} />
          </Pestania>
          <Pestania activa={seccion === 'desestimados'} alElegir={() => irA('desestimados')}>
            Desestimados por la IA <Cantidad valor={desestimados.data?.length} />
          </Pestania>
          <Pestania activa={seccion === 'todos'} alElegir={() => irA('todos')}>
            Todos
          </Pestania>
        </nav>
      </div>

      {seccion === 'pendientes' && (
        <SeccionPendientes revision={revision} alRevisar={abrir} alVerIncidente={setIncidenteId} />
      )}
      {seccion === 'desestimados' && <SeccionDesestimados revision={revision} alRevisar={abrir} />}
      {seccion === 'todos' && <SeccionTodos consulta={todos} alAbrir={abrirDeTodos} />}

      {actual && (
        <Modal titulo={`Reporte #${actual.id}`} ancho="max-w-4xl" alCerrar={() => setAbierto(null)}>
          <DetalleReporte
            reporte={actual}
            marcado={enDesestimados !== undefined}
            decidir={{
              bloqueado: enCurso,
              yaResuelto: !enPendientes && !enDesestimados,
              enviando: revisar.isPending ? (revisar.variables?.decision ?? null) : null,
              error: revisar.isError ? aErrorApi(revisar.error) : null,
              alDecidir: (decision, comentario) =>
                revisar.mutate(
                  { id: actual.id, decision, comentario },
                  { onSuccess: () => setAbierto(null) },
                ),
            }}
          />
        </Modal>
      )}
      {consultado && (
        <Modal titulo={`Reporte #${consultado.id}`} ancho="max-w-4xl" alCerrar={() => setConsultado(null)}>
          <DetalleReporte
            reporte={consultado}
            marcado={consultado.marcadoParaDesestimar}
            resultado={
              <Resultado
                reporte={consultado}
                alVerIncidente={(id) => {
                  setConsultado(null);
                  setIncidenteId(id);
                }}
              />
            }
          />
        </Modal>
      )}
      {incidenteId !== null && (
        // La ficha trae su propio título y su botón para cerrar.
        <Modal ancho="max-w-md" alCerrar={() => setIncidenteId(null)}>
          <FichaIncidente id={incidenteId} alCerrar={() => setIncidenteId(null)} />
        </Modal>
      )}
    </section>
  );
}

function Pestania({
  activa,
  alElegir,
  children,
}: {
  activa: boolean;
  alElegir: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-current={activa ? 'page' : undefined}
      className={`-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm ${
        activa
          ? 'border-primario font-semibold text-texto'
          : 'border-transparent text-texto-secundario hover:text-texto'
      }`}
    >
      {children}
    </button>
  );
}

function Cantidad({ valor }: { valor: number | undefined }) {
  return (
    <span className="rounded-full bg-superficie-alterna px-2 text-xs font-semibold text-texto">
      {valor ?? '…'}
    </span>
  );
}

/** En qué quedó un reporte ya decidido: lo que se ve en lugar de la decisión al consultarlo. */
function Resultado({
  reporte,
  alVerIncidente,
}: {
  reporte: ReporteDelOrganismo;
  alVerIncidente: (incidenteId: number) => void;
}) {
  const explicacion =
    reporte.estadoVerificacion === 'DESESTIMADO'
      ? 'Desestimado: no se muestra en el mapa.'
      : reporte.estadoVerificacion === 'PENDIENTE_REVISION'
        ? 'Sigue pendiente, en un incidente que ya se cerró.'
        : reporte.publicadoPorIaEn
          ? `Lo publicó la IA el ${fechaCorta(reporte.publicadoPorIaEn)}.`
          : 'Lo publicó un operador.';
  return (
    <div className="flex flex-col gap-2 border-t border-borde pt-4">
      <div className="flex items-center gap-2">
        <EstadoReporte reporte={reporte} />
        <p className="text-texto">{explicacion}</p>
      </div>
      {reporte.estadoVerificacion === 'VERIFICADO' && reporte.incidente && (
        <button
          type="button"
          onClick={() => alVerIncidente(reporte.incidente!.id)}
          className={`self-start ${enlace}`}
        >
          Ver el incidente #{reporte.incidente.id}
        </button>
      )}
    </div>
  );
}
