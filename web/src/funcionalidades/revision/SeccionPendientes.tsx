import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { resultadoIa } from './estadoIa.js';
import {
  botonPrimario,
  botonSecundario,
  dolares,
  enlace,
  EtiquetaIa,
  fechaCorta,
  Lista,
  Miniatura,
  segundos,
  Vacio,
} from './piezas.js';
import { severidadEnTexto, type ProcesoCola, type ReportePendiente } from './tipos.js';
import type { useRevision } from './useRevision.js';

type Revision = ReturnType<typeof useRevision>;

interface Props {
  revision: Revision;
  alRevisar: (reporte: ReportePendiente) => void;
  alVerIncidente: (incidenteId: number) => void;
}

/**
 * Los pendientes y su procesamiento con IA en el mismo lugar: al procesar, cada fila muestra en vivo qué hizo la
 * IA con su foto. Lo que resolvió sigue a la vista con su resultado hasta «Listo».
 */
export function SeccionPendientes({ revision, alRevisar, alVerIncidente }: Props) {
  const { pendientes, filas, procesoDeSesion, proceso, enCurso, procesar } = revision;
  const pendientesAhora = new Set(pendientes.data?.map((reporte) => reporte.id) ?? []);
  // La IA mira solo los que todavía no miró: los demás ya tienen su respuesta y esperan a una persona.
  const sinMirar = pendientes.data?.filter((reporte) => reporte.propuestaIa === null).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-texto-secundario">
          La IA mira la foto de cada reporte: publica los que están bien, aparta los que no muestran un
          problema de la vía pública y te deja el resto.
        </p>
        <div className="flex gap-2">
          {revision.hayResueltos && !enCurso && (
            <button type="button" onClick={revision.listo} className={botonSecundario}>
              Listo
            </button>
          )}
          <button
            type="button"
            onClick={() => procesar.mutate()}
            disabled={enCurso || procesar.isPending || sinMirar === 0}
            className={botonPrimario}
          >
            {enCurso ? 'Procesando…' : `Procesar con IA${sinMirar ? ` (${sinMirar})` : ''}`}
          </button>
        </div>
      </div>

      {procesar.isError && <AvisoError error={aErrorApi(procesar.error)} />}
      {proceso && <ResumenIa proceso={proceso} />}

      {pendientes.isPending && <Cargando />}
      {pendientes.isError && (
        <AvisoError error={aErrorApi(pendientes.error)} alReintentar={() => void pendientes.refetch()} />
      )}
      {pendientes.data && filas.length === 0 && <Vacio>No hay reportes esperando revisión.</Vacio>}

      <Lista>
        {filas.map((reporte) => {
          const pendiente = pendientesAhora.has(reporte.id);
          const resultado = resultadoIa(
            procesoDeSesion?.eventos.filter((evento) => evento.reporte.id === reporte.id) ?? [],
            { enCurso: enCurso && procesoDeSesion !== undefined, yaAnalizado: reporte.propuestaIa !== null },
          );
          // Qué decir debajo: el motivo de la IA en este procesamiento o, si la miró antes, lo que vio.
          const nota =
            resultado?.motivo ?? resultado?.explicacion ?? reporte.propuestaIa?.explicacion ?? null;
          const ocupado = resultado?.estado === 'EN_COLA' || resultado?.estado === 'ANALIZANDO';
          return (
            <li key={reporte.id} className="flex items-center gap-3 py-3">
              <Miniatura fotoId={reporte.fotos[0]?.id} tenue={!pendiente} />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-sm font-semibold text-texto">
                  {reporte.categoria.nombre} · {severidadEnTexto[reporte.severidadDeclarada]}
                </p>
                <p className="truncate text-xs text-texto-secundario">
                  #{reporte.id} · {reporte.direccion ?? 'Dirección pendiente'} ·{' '}
                  {fechaCorta(reporte.registradoEn)}
                </p>
                {nota && (
                  <p className="truncate text-xs text-texto-secundario" title={nota}>
                    {nota}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {resultado && <EtiquetaIa estado={resultado.estado} />}
                {pendiente && !ocupado && resultado?.estado !== 'DESESTIMAR' && (
                  <button
                    type="button"
                    onClick={() => alRevisar(reporte)}
                    disabled={enCurso}
                    className={`${enlace} disabled:opacity-50`}
                    aria-label={`Revisar el reporte #${reporte.id}`}
                  >
                    Revisar
                  </button>
                )}
                {resultado?.estado === 'PUBLICADO' && reporte.incidente && (
                  <button
                    type="button"
                    onClick={() => alVerIncidente(reporte.incidente!.id)}
                    className={enlace}
                    aria-label={`Ver el incidente del reporte #${reporte.id}`}
                  >
                    Ver
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </Lista>
    </div>
  );
}

/** El avance mientras la IA trabaja y, al terminar, en qué quedó el último procesamiento. */
function ResumenIa({ proceso }: { proceso: ProcesoCola }) {
  const r = proceso.resumen;
  if (proceso.enCurso) {
    const porcentaje = r.total === 0 ? 0 : Math.round((r.procesados / r.total) * 100);
    return (
      <div className="flex items-center gap-3 text-xs text-texto-secundario" role="status">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie-alterna">
          <div
            className="h-full rounded-full bg-primario transition-all"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <span>
          La IA revisó {r.procesados} de {r.total}
        </span>
      </div>
    );
  }
  const partes = [
    [r.publicados, 'publicados'],
    [r.derivados, 'para revisar'],
    [r.desestimados, 'para desestimar'],
    [r.errores, r.errores === 1 ? 'error' : 'errores'],
  ]
    .filter(([cantidad]) => cantidad !== 0)
    .map(([cantidad, texto]) => `${cantidad} ${texto}`);
  const datos = [
    r.tiempoMedioMs !== null ? `${segundos(r.tiempoMedioMs)} por foto` : null,
    r.costoUsd !== null ? dolares(r.costoUsd) : null,
  ].filter(Boolean);
  return (
    <p className="rounded-md bg-superficie-alterna px-3 py-2 text-xs text-texto-secundario" role="status">
      <span className="font-semibold text-texto">
        Último procesamiento ({fechaCorta(proceso.iniciadoEn)}): {r.total}{' '}
        {r.total === 1 ? 'reporte' : 'reportes'}
      </span>
      {partes.length > 0 && ` · ${partes.join(' · ')}`}
      {datos.length > 0 && ` · ${datos.join(' · ')}`}
    </p>
  );
}
