import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { ESTADOS_INCIDENTE } from './EtiquetaEstadoIncidente.js';
import { fechaHora } from './formato.js';
import type { Movimiento, TipoMovimiento } from './tipos.js';
import type { useAccionesFicha } from './useGestion.js';

const TIPOS: Record<TipoMovimiento, string> = {
  CAMBIO_ESTADO: 'Cambio de estado',
  DERIVACION: 'Derivación',
  FUSION: 'Unión',
  SEPARACION: 'Separación',
  AJUSTE_PRIORIDAD: 'Prioridad',
  COMENTARIO: 'Comentario',
};

interface Props {
  movimientos: Movimiento[];
  comentar: ReturnType<typeof useAccionesFicha>['comentar'];
}

/** Lo que pasó con el incidente, lo último primero, y el campo para comentar. La bitácora solo crece. */
export function Bitacora({ movimientos, comentar }: Props) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);

  function enviar() {
    if (!comentario.trim()) {
      setError('Escribí el comentario');
      return;
    }
    comentar.mutate(comentario, { onSuccess: () => setComentario('') });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borde p-4">
      <h2 className="font-semibold text-texto">Bitácora</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="bitacora-comentario" className="text-sm font-semibold text-texto">
          Comentario
        </label>
        <textarea
          id="bitacora-comentario"
          rows={2}
          maxLength={1000}
          value={comentario}
          onChange={(evento) => {
            setComentario(evento.target.value);
            setError(null);
          }}
          className={`w-full rounded-md border bg-superficie px-3 py-2 text-sm text-texto focus:outline-none ${
            error ? 'border-peligro' : 'border-borde focus:border-primario'
          }`}
        />
        {error && <p className="text-sm text-peligro">{error}</p>}
        {comentar.isError && <AvisoError error={aErrorApi(comentar.error)} />}
        <button
          type="button"
          disabled={comentar.isPending}
          onClick={enviar}
          className="self-end rounded-md border border-borde px-3 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna disabled:opacity-50"
        >
          {comentar.isPending ? 'Guardando…' : 'Comentar'}
        </button>
      </div>

      {movimientos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Todavía no hay movimientos.</p>
      ) : (
        <ol aria-label="Movimientos" className="flex flex-col divide-y divide-borde">
          {[...movimientos].reverse().map((movimiento) => (
            <FilaMovimiento key={movimiento.id} movimiento={movimiento} />
          ))}
        </ol>
      )}
    </section>
  );
}

function FilaMovimiento({ movimiento }: { movimiento: Movimiento }) {
  const { estadoAnterior, estadoNuevo, incidenteRelacionadoId } = movimiento;
  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm">
      <p className="text-xs text-texto-secundario">
        {fechaHora(movimiento.creadoEn)} · {movimiento.usuario?.nombre ?? 'Sistema'}
      </p>
      <p className="font-semibold text-texto">
        {TIPOS[movimiento.tipo]}
        {estadoAnterior && estadoNuevo && estadoAnterior !== estadoNuevo && (
          <span className="font-normal text-texto-secundario">
            {' '}
            · {ESTADOS_INCIDENTE[estadoAnterior].etiqueta} → {ESTADOS_INCIDENTE[estadoNuevo].etiqueta}
          </span>
        )}
      </p>
      {movimiento.comentario && <p className="text-texto">{movimiento.comentario}</p>}
      {incidenteRelacionadoId !== null && (
        <Link to={`/bandeja/${incidenteRelacionadoId}`} className="text-xs text-primario hover:underline">
          Ver el incidente #{incidenteRelacionadoId}
        </Link>
      )}
    </li>
  );
}
