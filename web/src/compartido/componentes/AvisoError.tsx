import type { ErrorApi } from '../red/error.js';

interface Props {
  error: ErrorApi;
  alReintentar?: () => void;
  reintentando?: boolean;
}

export function AvisoError({ error, alReintentar, reintentando = false }: Props) {
  return (
    <div role="alert" className="rounded-lg border border-peligro bg-superficie-alterna p-4 text-texto">
      <p className="font-semibold text-peligro">{error.mensaje}</p>
      {error.detalles.length > 0 && (
        <ul className="mt-2 list-disc pl-6 text-sm text-texto-secundario">
          {error.detalles.map((detalle, indice) => (
            <li key={indice}>
              <span className="font-semibold">{detalle.campo}</span>: {detalle.mensaje}
            </li>
          ))}
        </ul>
      )}
      {alReintentar && (
        <button
          type="button"
          onClick={alReintentar}
          disabled={reintentando}
          className="mt-3 rounded-md border border-borde bg-superficie px-3 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna disabled:text-texto-secundario"
        >
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </button>
      )}
    </div>
  );
}
