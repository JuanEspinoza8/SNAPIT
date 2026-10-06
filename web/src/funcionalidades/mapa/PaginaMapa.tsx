import { useCallback, useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useCategorias, useIncidentes } from './consultas.js';
import { ESTADOS, ORDEN_ESTADOS } from './estados.js';
import { FichaIncidente } from './FichaIncidente.js';
import { FiltrosMapa } from './FiltrosMapa.js';
import { MapaIncidentes, type Vista } from './MapaIncidentes.js';
import type { FiltrosMapa as Filtros, Rectangulo } from './tipos.js';

/** Mapa público (F03): se ve sin iniciar sesión. */
export function PaginaMapa() {
  const [filtros, setFiltros] = useState<Filtros>({});
  const [rectangulo, setRectangulo] = useState<Rectangulo | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);

  const categorias = useCategorias();
  const incidentes = useIncidentes(filtros, rectangulo);

  const alCambiarVista = useCallback((vista: Vista) => setRectangulo(vista.rectangulo), []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-texto">Mapa de incidentes</h1>
        <p className="text-sm text-texto-secundario" aria-live="polite">
          {incidentes.data
            ? `${incidentes.data.length} ${incidentes.data.length === 1 ? 'incidente' : 'incidentes'} en esta zona`
            : 'Cargando…'}
        </p>
      </div>

      <FiltrosMapa filtros={filtros} categorias={categorias.data ?? []} alCambiar={setFiltros} />

      {incidentes.isError && (
        <AvisoError
          error={aErrorApi(incidentes.error)}
          alReintentar={() => void incidentes.refetch()}
          reintentando={incidentes.isFetching}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="h-[60vh] min-h-80 overflow-hidden rounded-lg border border-borde">
          <MapaIncidentes
            puntos={incidentes.data ?? []}
            categorias={categorias.data ?? []}
            alCambiarVista={alCambiarVista}
            alElegir={setElegido}
          />
        </div>
        <div className="flex flex-col gap-4">
          {elegido !== null && <FichaIncidente id={elegido} alCerrar={() => setElegido(null)} />}
          <section aria-label="Referencias" className="rounded-lg border border-borde p-4 text-sm">
            <h2 className="mb-2 font-semibold text-texto">Referencias</h2>
            <ul className="flex flex-col gap-1.5">
              {ORDEN_ESTADOS.map((estado) => (
                <li key={estado} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`marcador-punto marcador-punto--chico ${ESTADOS[estado].clase}${
                      estado === 'REGISTRADO' ? ' marcador-punto--revision' : ''
                    }`}
                  />
                  {ESTADOS[estado].etiqueta}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="marcador-grupo marcador-grupo--chico">
                  3
                </span>
                Varios incidentes juntos: acercá el mapa para separarlos
              </li>
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}
