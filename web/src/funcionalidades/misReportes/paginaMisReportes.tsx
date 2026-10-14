import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { FichaIncidente } from '../mapa/FichaIncidente.js';
import { FilaReporte } from './FilaReporte.js';
import { useMisReportes } from './useMisReportes.js';

/** Los reportes del vecino con su estado; si toca uno, abre la ficha en la misma página. */
export function PaginaMisReportes() {
  const { data, isPending, isError, error, refetch, isFetching } = useMisReportes();
  const [seleccion, setSeleccion] = useState<number | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-texto">Mis reportes</h1>

      {isPending && <Cargando />}

      {isError && (
        <AvisoError error={aErrorApi(error)} alReintentar={() => void refetch()} reintentando={isFetching} />
      )}

      {data && data.length === 0 && <SinReportes />}

      {data && data.length > 0 && (
        <div className={`grid items-start gap-4 ${seleccion !== null ? 'lg:grid-cols-[1fr_20rem]' : ''}`}>
          <ul className="flex flex-col gap-3">
            {data.map((reporte) => (
              <FilaReporte key={reporte.id} reporte={reporte} alAbrirFicha={setSeleccion} />
            ))}
          </ul>
          {seleccion !== null && <FichaIncidente id={seleccion} alCerrar={() => setSeleccion(null)} />}
        </div>
      )}
    </section>
  );
}

/** Lo que se ve cuando el vecino todavía no reportó nada. */
function SinReportes() {
  return (
    <div className="rounded-lg border border-borde bg-superficie p-6 text-center">
      <p className="font-semibold text-texto">Todavía no hiciste reportes</p>
      <p className="mt-1 text-sm text-texto-secundario">
        Cuando reportes un problema, acá vas a ver en qué estado está.
      </p>
      <Link
        to="/reportar"
        className="mt-4 inline-block rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
      >
        Reportar un problema
      </Link>
    </div>
  );
}
