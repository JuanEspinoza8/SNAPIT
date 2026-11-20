import { aErrorApi } from '../../compartido/red/error.js';
import type { FichaIncidente } from '../mapa/tipos.js';
import { useConfirmacion, useConfirmar } from './consultas.js';
import { useIrAlIngreso, usePermisos } from './Interacciones.js';

const contador = (cantidad: number) =>
  cantidad === 0
    ? 'Nadie confirmó todavía que sigue'
    : cantidad === 1
      ? '1 vecino confirmó que sigue'
      : `${cantidad} vecinos confirmaron que sigue`;

/**
 * «Sigue estando» (F12): el vecino confirma, una sola vez, que el problema sigue ahí. Sin sesión lleva al ingreso
 * y se vuelve a la ficha. El operador y el administrador no confirman: ven solo el contador. En un problema
 * resuelto no hay nada que confirmar y no se muestra nada, igual que en la app.
 */
export function ConfirmarSigue({ ficha }: { ficha: FichaIncidente }) {
  const { conSesion, vecino } = usePermisos();
  const { irAlIngreso } = useIrAlIngreso();
  const abierto = ficha.estado !== 'RESUELTO';
  const confirmacion = useConfirmacion(ficha.id, vecino && abierto);
  const confirmar = useConfirmar(ficha.id);
  const error = confirmar.isError ? aErrorApi(confirmar.error) : null;
  const confirmado = confirmacion.data?.confirmado === true || error?.codigo === 'YA_CONFIRMADO';
  // Mientras se pregunta si ya confirmó, no se deja confirmar.
  const esperando = (vecino && confirmacion.isPending) || confirmar.isPending;

  const texto = !conSesion
    ? 'Ingresá para confirmar que sigue'
    : confirmado
      ? 'Ya confirmaste que sigue'
      : confirmar.isPending
        ? 'Confirmando…'
        : 'Sigue estando';

  if (!abierto) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      {(vecino || !conSesion) && (
        <button
          type="button"
          disabled={confirmado || esperando}
          onClick={() => (conSesion ? confirmar.mutate() : irAlIngreso())}
          className={`rounded-md px-4 py-2 text-sm font-semibold ${
            confirmado
              ? 'border border-borde text-texto-secundario'
              : 'bg-primario text-sobre-primario hover:opacity-90 disabled:opacity-50'
          }`}
        >
          {texto}
        </button>
      )}
      <p role="status" className="text-sm text-texto-secundario">
        {contador(ficha.cantidadConfirmaciones)}
      </p>
      {error && !confirmado && (
        <p role="alert" className="text-sm text-peligro">
          {error.mensaje}
        </p>
      )}
    </div>
  );
}
