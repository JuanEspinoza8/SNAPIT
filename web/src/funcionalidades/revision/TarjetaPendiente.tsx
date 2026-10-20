import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import type { ErrorApi } from '../../compartido/red/error.js';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { MapaChico } from './MapaChico.js';
import { origenEnTexto, severidadEnTexto } from './tipos.js';
import type { DecisionRevision, ReportePendiente } from './tipos.js';

const fecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
});

interface Props {
  reporte: ReportePendiente;
  /** Si esta tarjeta está abierta (solo una a la vez). */
  abierta: boolean;
  alAbrir: () => void;
  /** Mientras el servidor procesa la decisión de este reporte. */
  enRevision: boolean;
  /** El error de la última decisión sobre este reporte, si falló. */
  error: ErrorApi | null;
  alRevisar: (decision: DecisionRevision, comentario: string) => void;
}

/** Un reporte pendiente de la bandeja: cerrada, resume; abierta, muestra todo para decidir. */
export function TarjetaPendiente({ reporte, abierta, alAbrir, enRevision, error, alRevisar }: Props) {
  return (
    <li className="rounded-lg border border-borde bg-superficie">
      <button
        type="button"
        onClick={alAbrir}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-superficie-alterna"
      >
        <Miniatura fotoId={reporte.fotos[0]?.id} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold text-texto">{reporte.categoria.nombre}</span>
          <span className="text-sm text-texto-secundario">
            {severidadEnTexto[reporte.severidadDeclarada]} · {fecha.format(new Date(reporte.registradoEn))}
          </span>
        </span>
        <span className="shrink-0 rounded-md bg-superficie-alterna px-2 py-0.5 text-xs font-semibold text-texto">
          Confianza {reporte.nivelConfianza}
        </span>
      </button>

      {abierta && <Detalle reporte={reporte} enRevision={enRevision} error={error} alRevisar={alRevisar} />}
    </li>
  );
}

/**
 * Lo que se ve con la tarjeta abierta. Es un componente aparte para que su estado (el comentario y la
 * confirmación de desestimar) se reinicie al cerrarla: si no, al volver a abrirla seguía pidiendo confirmar.
 */
function Detalle({
  reporte,
  enRevision,
  error,
  alRevisar,
}: Pick<Props, 'reporte' | 'enRevision' | 'error' | 'alRevisar'>) {
  const [comentario, setComentario] = useState('');
  const [confirmandoDesestimar, setConfirmandoDesestimar] = useState(false);

  return (
    <div className="flex flex-col gap-4 border-t border-borde p-3">
      <Senales reporte={reporte} />

      <div className="flex flex-col gap-1 text-sm">
        {reporte.descripcion && <p className="text-texto">{reporte.descripcion}</p>}
        <p className="text-texto-secundario">
          {reporte.direccion ?? 'Sin dirección (Nominatim todavía no la completó)'}
        </p>
        <p className="text-texto-secundario">
          Origen: {origenEnTexto[reporte.origen]} · Vecino con reputación {reporte.vecino.reputacion} (
          {reporte.vecino.reportesConfirmados} confirmados · {reporte.vecino.reportesDesestimados}{' '}
          desestimados)
        </p>
        {reporte.incidente && (
          <p className="text-texto-secundario">
            Incidente #{reporte.incidente.id} con {reporte.incidente.cantidadReportes} reporte
            {reporte.incidente.cantidadReportes === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <MapaChico lat={reporte.lat} lon={reporte.lon} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-texto">Comentario (opcional)</span>
        <textarea
          value={comentario}
          onChange={(evento) => setComentario(evento.target.value)}
          maxLength={1000}
          rows={2}
          disabled={enRevision}
          placeholder="Por qué verificás o desestimás este reporte"
          className="rounded-md border border-borde bg-superficie p-2 text-sm text-texto placeholder:text-texto-secundario disabled:bg-superficie-alterna"
        />
      </label>

      {error && <AvisoError error={error} />}

      {!confirmandoDesestimar ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => alRevisar('VERIFICADO', comentario)}
            disabled={enRevision}
            className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-60"
          >
            {enRevision ? 'Enviando…' : 'Verificar'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmandoDesestimar(true)}
            disabled={enRevision}
            className="rounded-md border border-peligro px-4 py-2 text-sm font-semibold text-peligro hover:bg-superficie-alterna disabled:opacity-60"
          >
            Desestimar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-peligro bg-superficie-alterna p-3">
          <p className="text-sm font-semibold text-peligro">
            ¿Desestimar este reporte? La reputación del vecino va a bajar.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => alRevisar('DESESTIMADO', comentario)}
              disabled={enRevision}
              className="rounded-md bg-peligro px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-60"
            >
              {enRevision ? 'Enviando…' : 'Sí, desestimar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoDesestimar(false)}
              disabled={enRevision}
              className="rounded-md border border-borde px-4 py-2 text-sm font-semibold text-texto hover:bg-superficie-alterna"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Cada señal con su explicación y su valor. El criterio de la issue es que se lea
 * en texto claro: manda el detalle del servidor y el número va al lado.
 */
function Senales({ reporte }: { reporte: ReportePendiente }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-texto">Por qué quedó con confianza {reporte.nivelConfianza}</p>
      <ul className="flex flex-col gap-2">
        {reporte.senales.map((senal, indice) => (
          <li key={`${senal.tipo}-${indice}`} className="flex items-start gap-2 text-sm">
            <span className={clasesDelValor(senal.valor)}>
              {senal.valor > 0 ? `+${senal.valor}` : senal.valor}
            </span>
            <span className="text-texto">{senal.detalle ?? SENALES_EN_TEXTO[senal.tipo] ?? senal.tipo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Por si el servidor no manda la explicación: al menos se lee qué se comprobó.
const SENALES_EN_TEXTO: Record<string, string> = {
  EXIF_COINCIDE: 'Ubicación de la foto',
  EXIF_AUSENTE: 'Foto sin ubicación',
  HASH_DUPLICADO: 'Foto repetida',
  ORIGEN_APP: 'Foto sacada con la cámara de la app',
  REPUTACION: 'Reputación del vecino',
  FECHA_ANTIGUA: 'Foto antigua',
};

function clasesDelValor(valor: number): string {
  const base = 'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold text-sobre-primario';
  if (valor > 0) return `${base} bg-estado-resuelto`;
  if (valor < 0) return `${base} bg-peligro`;
  return `${base} bg-estado-desestimado`;
}

/** Miniatura de la foto, pedida con la sesión del operador (docs/api.md, GET /api/fotos/:id). */
function Miniatura({ fotoId }: { fotoId: number | undefined }) {
  const noDisponible = (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-borde bg-superficie-alterna text-center text-xs leading-tight text-texto-secundario">
      Foto no disponible
    </span>
  );

  if (fotoId === undefined) return noDisponible;
  return (
    <FotoConSesion
      fotoId={fotoId}
      className="h-16 w-16 shrink-0 rounded-md border border-borde object-cover"
      siFalla={noDisponible}
    />
  );
}
