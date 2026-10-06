import type { ErrorApi } from '../red/error.js';

export function AvisoError({ error }: { error: ErrorApi }) {
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
    </div>
  );
}
