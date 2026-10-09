import { EtiquetaEstado } from './EtiquetaEstado.js';
import type { PuntoMapa } from './tipos.js';
import { useTraerALaVista } from './useTraerALaVista.js';

const fecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: 'America/Argentina/Buenos_Aires',
});

interface Props {
  puntos: PuntoMapa[];
  alElegir: (id: number) => void;
  alCerrar: () => void;
}

/** Incidentes tan juntos que acercando el mapa no se separan: se elige cuál abrir de esta lista. */
export function ListaIncidentes({ puntos, alElegir, alCerrar }: Props) {
  const panel = useTraerALaVista(puntos);

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="Incidentes en el mismo lugar"
      className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4 shadow-sm outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-semibold text-texto">{puntos.length} incidentes en el mismo lugar</h2>
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar la lista"
          className="rounded-md px-2 py-1 text-sm text-texto-secundario hover:bg-superficie-alterna"
        >
          Cerrar
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {puntos.map((punto) => (
          <li key={punto.id}>
            <button
              type="button"
              onClick={() => alElegir(punto.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-borde px-3 py-2 text-left text-sm text-texto hover:bg-superficie-alterna"
            >
              <span className="flex flex-col">
                {punto.categoriaNombre}
                <span className="text-xs text-texto-secundario">
                  Desde el {fecha.format(new Date(punto.primerReporteEn))}
                </span>
              </span>
              <EtiquetaEstado estado={punto.estado} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
