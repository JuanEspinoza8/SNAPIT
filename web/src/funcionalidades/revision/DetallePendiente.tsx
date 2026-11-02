import { useState, type ReactNode } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import type { ErrorApi } from '../../compartido/red/error.js';
import { MapaChico } from './MapaChico.js';
import { SENALES, type ReportePendiente, type Severidad } from './tipos.js';

type Decision = 'VERIFICADO' | 'DESESTIMADO';

interface Props {
  reporte: ReportePendiente;
  /** La IA está procesando la cola: mientras tanto no se decide a mano. */
  bloqueado: boolean;
  /** Ya no está pendiente (lo decidió otro operador o la IA): no queda nada por decidir. */
  yaResuelto?: boolean;
  /** Para consultar un reporte ya decidido: se muestra esto (su resultado) en lugar de la decisión. */
  soloLectura?: ReactNode;
  enviando: Decision | null;
  error: ErrorApi | null;
  alDecidir: (decision: Decision, comentario: string) => void;
}

const GRAVEDADES: Record<Severidad, string> = { LEVE: 'Leve', MODERADA: 'Moderada', GRAVE: 'Grave' };
const MAX_COMENTARIO = 1000;

/** Todo lo que el operador necesita para aprobar o desestimar un pendiente, y la decisión. */
export function DetallePendiente({
  reporte,
  bloqueado,
  yaResuelto = false,
  soloLectura,
  enviando,
  error,
  alDecidir,
}: Props) {
  const categorias = useCategorias();
  const [comentario, setComentario] = useState('');
  // Desestimar baja la reputación del vecino: se pide confirmar antes de mandarlo.
  const [confirmandoDesestimar, setConfirmandoDesestimar] = useState(false);
  const [fotoElegida, setFotoElegida] = useState(0);
  const foto = reporte.fotos[fotoElegida] ?? reporte.fotos[0];
  const propuesta = reporte.propuestaIa;
  const nombrePropuesta = propuesta
    ? (categorias.data?.find((c) => c.id === propuesta.categoriaId)?.nombre ??
      `Categoría ${propuesta.categoriaId}`)
    : null;
  const coincide =
    propuesta !== null &&
    propuesta.categoriaId === reporte.categoria.id &&
    propuesta.severidad === reporte.severidadDeclarada;
  const deshabilitado = bloqueado || yaResuelto || enviando !== null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Izquierda: la evidencia */}
      <div className="flex flex-col gap-3">
        {foto ? (
          <FotoConSesion
            key={foto.id}
            fotoId={foto.id}
            className="aspect-[4/3] w-full rounded object-cover"
            siFalla={<span className="aspect-[4/3] w-full rounded bg-superficie-alterna" />}
          />
        ) : (
          <span className="flex aspect-[4/3] w-full items-center justify-center rounded bg-superficie-alterna text-sm text-texto-secundario">
            Sin foto
          </span>
        )}
        {reporte.fotos.length > 1 && (
          <div className="flex gap-2">
            {reporte.fotos.map((otra, indice) => (
              <button
                key={otra.id}
                type="button"
                onClick={() => setFotoElegida(indice)}
                aria-label={`Ver la foto ${indice + 1}`}
                className={`rounded border-2 ${indice === fotoElegida ? 'border-primario' : 'border-transparent'}`}
              >
                <FotoConSesion fotoId={otra.id} className="h-12 w-16 rounded object-cover" siFalla={null} />
              </button>
            ))}
          </div>
        )}

        <Bloque titulo="Lo que reportó el vecino">
          <p className="font-semibold text-texto">
            {reporte.categoria.nombre} · {GRAVEDADES[reporte.severidadDeclarada]}
          </p>
          <p className="text-texto">
            {reporte.descripcion ?? <i className="text-texto-secundario">Sin descripción</i>}
          </p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-texto-secundario">Dirección</dt>
            <dd className="text-texto">{reporte.direccion ?? 'pendiente'}</dd>
            <dt className="text-texto-secundario">Fecha</dt>
            <dd className="text-texto">{new Date(reporte.registradoEn).toLocaleString('es-AR')}</dd>
            <dt className="text-texto-secundario">Enviado desde</dt>
            <dd className="text-texto">{reporte.origen === 'APP_MOVIL' ? 'la app' : 'el sitio web'}</dd>
            <dt className="text-texto-secundario">Ubicación</dt>
            <dd className="font-mono text-texto">
              {reporte.lat.toFixed(5)}, {reporte.lon.toFixed(5)}
            </dd>
            {reporte.incidente && (
              <>
                <dt className="text-texto-secundario">Incidente</dt>
                <dd className="text-texto">
                  #{reporte.incidente.id} · {reporte.incidente.cantidadReportes} reporte
                  {reporte.incidente.cantidadReportes === 1 ? '' : 's'}
                </dd>
              </>
            )}
          </dl>
        </Bloque>

        <MapaChico lat={reporte.lat} lon={reporte.lon} />
      </div>

      {/* Derecha: por qué está pendiente, y la decisión */}
      <div className="flex flex-col gap-3">
        {propuesta && (
          <Bloque titulo="Lo que propuso la IA">
            <p className="font-semibold text-texto">
              {nombrePropuesta} · {GRAVEDADES[propuesta.severidad]}
            </p>
            <p
              className={`text-xs font-semibold ${coincide ? 'text-estado-resuelto' : 'text-estado-registrado'}`}
            >
              {coincide
                ? '✓ Coincide con el vecino'
                : '≠ No coincide con el vecino: por eso quedó para revisión'}
            </p>
            {propuesta.explicacion && <p className="text-texto-secundario">{propuesta.explicacion}</p>}
          </Bloque>
        )}

        <Bloque titulo={`Confianza ${reporte.nivelConfianza} de 100`}>
          <ul className="flex flex-col gap-1.5">
            {reporte.senales.map((senal, indice) => (
              <li key={indice} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-texto">{senal.detalle ?? SENALES[senal.tipo] ?? senal.tipo}</p>
                  {senal.detalle && (
                    <p className="text-xs text-texto-secundario">{SENALES[senal.tipo] ?? senal.tipo}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 font-mono text-sm font-semibold ${
                    senal.valor > 0
                      ? 'text-estado-resuelto'
                      : senal.valor < 0
                        ? 'text-peligro'
                        : 'text-texto-secundario'
                  }`}
                >
                  {senal.valor > 0 ? `+${senal.valor}` : senal.valor}
                </span>
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo="El vecino">
          <p className="text-texto">
            Reputación <b>{reporte.vecino.reputacion}</b> de 100 · {reporte.vecino.reportesConfirmados}{' '}
            confirmado
            {reporte.vecino.reportesConfirmados === 1 ? '' : 's'} · {reporte.vecino.reportesDesestimados}{' '}
            desestimado
            {reporte.vecino.reportesDesestimados === 1 ? '' : 's'}
          </p>
        </Bloque>

        {soloLectura ?? (
          <div className="flex flex-col gap-2 rounded-md border border-borde p-3">
            <label htmlFor="comentario" className="text-sm font-semibold text-texto">
              Comentario{' '}
              <span className="font-normal text-texto-secundario">(opcional, queda en la bitácora)</span>
            </label>
            <textarea
              id="comentario"
              value={comentario}
              onChange={(evento) => setComentario(evento.target.value)}
              maxLength={MAX_COMENTARIO}
              rows={2}
              disabled={deshabilitado}
              className="rounded-md border border-borde bg-superficie p-2 text-sm text-texto disabled:opacity-50"
              placeholder="Por ejemplo: la foto es de otro lugar"
            />
            {yaResuelto && (
              <p className="text-xs font-semibold text-texto-secundario">
                Este reporte ya no está pendiente: no queda nada por decidir.
              </p>
            )}
            {bloqueado && !yaResuelto && (
              <p className="text-xs text-texto-secundario">
                La IA está procesando la cola: esperá a que termine para decidir a mano.
              </p>
            )}
            {error && <AvisoError error={error} />}
            {!confirmandoDesestimar ? (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => setConfirmandoDesestimar(true)}
                  className="rounded-md border border-peligro px-4 py-2 text-sm font-semibold text-peligro hover:bg-superficie-alterna disabled:opacity-50"
                >
                  Desestimar
                </button>
                <button
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => alDecidir('VERIFICADO', comentario)}
                  className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
                >
                  {enviando === 'VERIFICADO' ? 'Aprobando…' : 'Aprobar y publicar'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-peligro bg-superficie-alterna p-3">
                <p className="text-sm font-semibold text-peligro">
                  ¿Desestimar este reporte? La reputación del vecino va a bajar.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={enviando !== null}
                    onClick={() => setConfirmandoDesestimar(false)}
                    className="rounded-md border border-borde px-4 py-2 text-sm font-semibold text-texto hover:bg-superficie disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={deshabilitado}
                    onClick={() => alDecidir('DESESTIMADO', comentario)}
                    className="rounded-md bg-peligro px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
                  >
                    {enviando === 'DESESTIMADO' ? 'Desestimando…' : 'Sí, desestimar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1 rounded-md border border-borde p-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">{titulo}</h3>
      {children}
    </section>
  );
}
