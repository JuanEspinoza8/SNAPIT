import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { apiUrl } from '../../config/entorno.js';
import { useFicha } from './consultas.js';
import { EtiquetaEstado } from './EtiquetaEstado.js';

const fecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'long',
  timeZone: 'America/Argentina/Buenos_Aires',
});

interface Props {
  id: number;
  alCerrar: () => void;
}

/** Lo que se abre al tocar un punto del mapa. */
export function FichaIncidente({ id, alCerrar }: Props) {
  const { data: ficha, isPending, isError, error, refetch, isFetching } = useFicha(id);

  return (
    <aside
      aria-label="Ficha del incidente"
      className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-semibold text-texto">{ficha?.categoria.nombre ?? 'Incidente'}</h2>
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar la ficha"
          className="rounded-md px-2 py-1 text-texto-secundario hover:bg-superficie-alterna"
        >
          ✕
        </button>
      </div>

      {isPending && <p className="text-sm text-texto-secundario">Cargando…</p>}

      {isError && (
        <AvisoError error={aErrorApi(error)} alReintentar={() => void refetch()} reintentando={isFetching} />
      )}

      {ficha && (
        <>
          <div>
            <EtiquetaEstado estado={ficha.estado} />
          </div>
          {ficha.enRevision && (
            <p className="text-sm text-texto-secundario">
              Todavía no se verificó: puede cambiar de categoría o descartarse.
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-texto-secundario">Primer reporte</dt>
            <dd>{fecha.format(new Date(ficha.primerReporteEn))}</dd>
            <dt className="text-texto-secundario">Vecinos que lo reportaron</dt>
            <dd>{ficha.cantidadVecinos}</dd>
            {ficha.direccion && (
              <>
                <dt className="text-texto-secundario">Dirección</dt>
                <dd>{ficha.direccion}</dd>
              </>
            )}
          </dl>
          {ficha.fotos.length > 0 && (
            <ul className="grid grid-cols-2 gap-2">
              {ficha.fotos.map((foto, indice) => (
                <li key={foto.id}>
                  <img
                    src={`${apiUrl}/fotos/${foto.id}`}
                    alt={`Foto ${indice + 1} de ${ficha.fotos.length} de ${ficha.categoria.nombre}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-md border border-borde object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
