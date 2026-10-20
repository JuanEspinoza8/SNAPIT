import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { FichaIncidente } from '../mapa/FichaIncidente.js';
import { DetallePendiente } from './DetallePendiente.js';
import type { Decision } from './estadoFila.js';
import { SeccionPendientes } from './SeccionPendientes.js';
import { EtiquetaEstado, fechaCorta, SeccionTodos } from './SeccionTodos.js';
import { Modal } from './Modal.js';
import { TablaProceso, type Seleccion } from './TablaProceso.js';
import type { EventoCola, ReporteDelOrganismo, ReportePendiente, Severidad } from './tipos.js';
import { useRevision } from './useRevision.js';

type Seccion = 'pendientes' | 'ia' | 'todos';
const SECCIONES: Seccion[] = ['pendientes', 'ia', 'todos'];

/**
 * La revisión del operador (F04): los reportes de baja confianza de su organismo. A la izquierda, sus dos
 * secciones: los pendientes, que se revisan a mano o se procesan con la IA (que publica los que coinciden con
 * el vecino), y el registro de cada procesamiento con IA.
 */
export function PaginaRevision() {
  const { pendientes, todos, proceso, procesar, revisar, enCurso, procesoDeSesion, olvidarProceso } =
    useRevision();
  // Un reporte ya decidido, abierto desde «Todos los reportes» para consultarlo.
  const [consultado, setConsultado] = useState<ReporteDelOrganismo | null>(null);
  // Lo decidido a mano desde esta pantalla: la fila queda con su resultado hasta «Limpiar resueltos».
  const [decisiones, setDecisiones] = useState<Map<number, Decision>>(new Map());
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  // La sección va en la URL: al recargar se sigue en la misma.
  const [parametros, setParametros] = useSearchParams();
  const pedida = parametros.get('seccion') as Seccion | null;
  const seccion: Seccion = pedida && SECCIONES.includes(pedida) ? pedida : 'pendientes';
  const irA = (destino: Seccion) =>
    setParametros(destino === 'pendientes' ? {} : { seccion: destino }, { replace: true });
  const cantidad = pendientes.data?.length ?? 0;
  // El pendiente abierto se busca en la lista cada vez: así el detalle muestra siempre lo último.
  // Se recuerda el reporte abierto: si mientras tanto deja de estar pendiente (por ejemplo, lo resolvió otro
  // operador), el detalle sigue a la vista con el aviso, en vez de cerrarse sin explicación.
  const [abierto, setAbierto] = useState<ReportePendiente | null>(null);
  const pendiente = pendientes.data?.find((reporte) => reporte.id === abierto?.id) ?? abierto;
  const sigueSinDecidir = pendientes.data?.some((reporte) => reporte.id === abierto?.id) ?? false;

  function abrirPendiente(id: number) {
    revisar.reset();
    setAbierto(pendientes.data?.find((reporte) => reporte.id === id) ?? null);
  }

  function limpiarResueltos() {
    setDecisiones(new Map());
    olvidarProceso();
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Revisión de reportes</h1>
        <p className="text-sm text-texto-secundario">
          Reportes de baja confianza de tu organismo, del más viejo al más nuevo. Revisá la foto, el nivel y
          las señales antes de decidir, o dejá que la IA los procese.
        </p>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Secciones de la revisión" className="flex gap-1 md:flex-col">
          <ItemMenu activo={seccion === 'pendientes'} alElegir={() => irA('pendientes')}>
            <span>Pendientes de aprobación</span>
            <span className="rounded-full bg-superficie-alterna px-2 text-xs font-semibold text-texto">
              {pendientes.data ? cantidad : '…'}
            </span>
          </ItemMenu>
          <ItemMenu activo={seccion === 'ia'} alElegir={() => irA('ia')}>
            <span>Procesamiento con IA</span>
            {enCurso && (
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-estado-verificado"
                aria-label="En curso"
              />
            )}
          </ItemMenu>
          <ItemMenu activo={seccion === 'todos'} alElegir={() => irA('todos')}>
            <span>Todos los reportes</span>
            <span className="rounded-full bg-superficie-alterna px-2 text-xs font-semibold text-texto">
              {todos.data ? todos.data.length : '…'}
            </span>
          </ItemMenu>
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {seccion === 'pendientes' && (
            <>
              <SeccionPendientes
                consulta={pendientes}
                proceso={procesoDeSesion}
                enCurso={enCurso}
                decisiones={decisiones}
                procesando={procesar.isPending}
                errorAlProcesar={procesar.isError ? procesar.error : null}
                alProcesar={() => procesar.mutate()}
                alLimpiar={limpiarResueltos}
                alRevisar={abrirPendiente}
                alVerReporte={(incidenteId) => setSeleccion({ tipo: 'ficha', incidenteId })}
              />
            </>
          )}

          {seccion === 'ia' && (
            <>
              <TablaProceso
                proceso={proceso.data}
                cargando={proceso.isPending && proceso.fetchStatus !== 'idle'}
                alElegir={setSeleccion}
              />
            </>
          )}

          {seccion === 'todos' && (
            <SeccionTodos
              consulta={todos}
              alAbrir={(reporte) =>
                // Un pendiente se abre para decidir; uno ya decidido, para consultarlo.
                reporte.estadoVerificacion === 'PENDIENTE_REVISION' &&
                pendientes.data?.some((otro) => otro.id === reporte.id)
                  ? abrirPendiente(reporte.id)
                  : setConsultado(reporte)
              }
            />
          )}
        </div>
      </div>
      {consultado && (
        <Modal titulo={`Reporte #${consultado.id}`} ancho="max-w-5xl" alCerrar={() => setConsultado(null)}>
          <DetallePendiente
            reporte={consultado}
            bloqueado={false}
            enviando={null}
            error={null}
            alDecidir={() => {}}
            soloLectura={
              <Resultado
                reporte={consultado}
                alVerIncidente={(incidenteId) => {
                  setConsultado(null);
                  setSeleccion({ tipo: 'ficha', incidenteId });
                }}
              />
            }
          />
        </Modal>
      )}
      {pendiente && (
        <Modal
          titulo={`Revisar el reporte #${pendiente.id}`}
          ancho="max-w-5xl"
          alCerrar={() => setAbierto(null)}
        >
          <DetallePendiente
            reporte={pendiente}
            bloqueado={enCurso}
            yaResuelto={!sigueSinDecidir}
            enviando={revisar.isPending ? (revisar.variables?.decision ?? null) : null}
            error={revisar.isError ? aErrorApi(revisar.error) : null}
            alDecidir={(decision, comentario) =>
              revisar.mutate(
                { id: pendiente.id, decision, comentario },
                {
                  onSuccess: () => {
                    setDecisiones((actuales) => new Map(actuales).set(pendiente.id, decision));
                    setAbierto(null);
                  },
                },
              )
            }
          />
        </Modal>
      )}
      {seleccion?.tipo === 'propuesta' && (
        <Modal
          titulo={`Propuesta de la IA · reporte #${seleccion.evento.reporte.id}`}
          alCerrar={() => setSeleccion(null)}
        >
          <Propuesta evento={seleccion.evento} />
        </Modal>
      )}
      {seleccion?.tipo === 'ficha' && (
        // La ficha trae su propio título y su botón para cerrar.
        <Modal ancho="max-w-md" alCerrar={() => setSeleccion(null)}>
          <FichaIncidente id={seleccion.incidenteId} alCerrar={() => setSeleccion(null)} />
        </Modal>
      )}
    </section>
  );
}

function ItemMenu({
  activo,
  alElegir,
  children,
}: {
  activo: boolean;
  alElegir: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-current={activo ? 'page' : undefined}
      className={`flex flex-1 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm md:flex-none ${
        activo
          ? 'bg-superficie-alterna font-semibold text-primario'
          : 'text-texto-secundario hover:bg-superficie-alterna'
      }`}
    >
      {children}
    </button>
  );
}

/** Lo que propuso la IA para un reporte, al lado de lo que eligió el vecino. */
function Propuesta({ evento }: { evento: EventoCola }) {
  const categorias = useCategorias();
  const nombre = (id: number | null) =>
    id === null ? '—' : (categorias.data?.find((c) => c.id === id)?.nombre ?? `Categoría ${id}`);
  const propuesta = evento.propuesta!;
  const coincide =
    propuesta.categoriaId === evento.reporte.categoria.id &&
    propuesta.severidad === evento.reporte.severidadDeclarada;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
      {evento.reporte.foto ? (
        <FotoConSesion
          fotoId={evento.reporte.foto.id}
          className="aspect-[4/3] w-full rounded object-cover"
          siFalla={<span className="aspect-[4/3] w-full rounded bg-superficie-alterna" />}
        />
      ) : (
        <span className="aspect-[4/3] w-full rounded bg-superficie-alterna" />
      )}
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-borde p-2">
            <p className="text-xs text-texto-secundario">El vecino eligió</p>
            <p className="font-semibold text-texto">{evento.reporte.categoria.nombre}</p>
            <Gravedad severidad={evento.reporte.severidadDeclarada} />
          </div>
          <div className="rounded-md border border-borde p-2">
            <p className="text-xs text-texto-secundario">La IA propone</p>
            <p className="font-semibold text-texto">{nombre(propuesta.categoriaId)}</p>
            {propuesta.severidad && <Gravedad severidad={propuesta.severidad} />}
          </div>
        </div>
        <p className={`font-semibold ${coincide ? 'text-estado-resuelto' : 'text-estado-registrado'}`}>
          {coincide ? 'Coinciden: la IA lo publica.' : 'No coinciden: queda para revisión manual.'}
        </p>
        {propuesta.explicacion && <p className="text-texto-secundario">{propuesta.explicacion}</p>}
      </div>
    </div>
  );
}

const GRAVEDADES: Record<Severidad, string> = { LEVE: 'Leve', MODERADA: 'Moderada', GRAVE: 'Grave' };

function Gravedad({ severidad }: { severidad: Severidad }) {
  return <span className="text-xs text-texto-secundario">{GRAVEDADES[severidad]}</span>;
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
      ? 'Lo desestimó un operador: no se muestra en el mapa.'
      : reporte.estadoVerificacion === 'PENDIENTE_REVISION'
        ? 'Sigue pendiente de revisión.'
        : reporte.publicadoPorIaEn
          ? `Lo publicó la IA el ${fechaCorta(reporte.publicadoPorIaEn)}, porque coincidió con lo que eligió el vecino.`
          : 'Publicado: lo verificó el sistema al recibirlo o un operador al revisarlo.';
  return (
    <div className="flex flex-col gap-2 rounded-md border border-borde p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">Resultado</h3>
        <EtiquetaEstado reporte={reporte} />
      </div>
      <p className="text-texto">{explicacion}</p>
      <p className="text-xs text-texto-secundario">Reportado el {fechaCorta(reporte.registradoEn)}</p>
      {reporte.estadoVerificacion === 'VERIFICADO' && reporte.incidente && (
        <button
          type="button"
          onClick={() => alVerIncidente(reporte.incidente!.id)}
          className="self-start text-sm text-primario underline hover:opacity-80"
        >
          Ver el incidente #{reporte.incidente.id}
        </button>
      )}
    </div>
  );
}
