import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { numero, numeroCorto } from './formato.js';
import type { Prioridad } from './tipos.js';
import type { useAccionesFicha } from './useGestion.js';

interface Props {
  prioridad: Prioridad;
  puedeFijar: boolean;
  puedeQuitar: boolean;
  alFijar: () => void;
  quitar: ReturnType<typeof useAccionesFicha>['quitarPrioridad'];
}

const conSigno = (valor: number) => `${valor > 0 ? '+' : ''}${numeroCorto.format(valor)}`;

/** El puntaje con cada parte que lo forma, explicada en texto, y el ajuste manual si lo hay. */
export function DesglosePrioridad({ prioridad, puedeFijar, puedeQuitar, alFijar, quitar }: Props) {
  const manual = prioridad.prioridadManual;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borde p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-texto">Prioridad</h2>
        <p className="text-2xl font-semibold text-texto">
          {numero.format(manual ?? prioridad.puntajePrioridad)}
        </p>
      </div>

      {manual !== null && (
        <p className="rounded-md bg-superficie-alterna p-2 text-sm text-texto">
          <span className="font-semibold">Fijada a mano</span>
          {prioridad.ajustadaPor && ` por ${prioridad.ajustadaPor.nombre}`}: {prioridad.motivoPrioridadManual}
          . La calculada es {numero.format(prioridad.puntajePrioridad)}.
        </p>
      )}

      <ul aria-label="Desglose de la prioridad" className="flex flex-col gap-1 text-sm">
        {prioridad.factores.map((factor) => (
          <li key={factor.factor} className="flex justify-between gap-3">
            <span className="text-texto">{factor.detalle ?? factor.factor}</span>
            <span className="shrink-0 font-semibold text-texto">{conSigno(factor.valor)}</span>
          </li>
        ))}
      </ul>

      {quitar.isError && <AvisoError error={aErrorApi(quitar.error)} />}
      {(puedeFijar || puedeQuitar) && (
        <div className="flex flex-wrap justify-end gap-2">
          {puedeQuitar && (
            <button
              type="button"
              disabled={quitar.isPending}
              onClick={() => quitar.mutate()}
              className="rounded-md border border-borde px-3 py-2 text-sm font-semibold text-texto hover:bg-superficie-alterna disabled:opacity-50"
            >
              {quitar.isPending ? 'Quitando…' : 'Quitar el ajuste'}
            </button>
          )}
          {puedeFijar && (
            <button
              type="button"
              onClick={alFijar}
              className="rounded-md border border-borde px-3 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna"
            >
              {manual === null ? 'Fijar a mano…' : 'Cambiar el ajuste…'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
