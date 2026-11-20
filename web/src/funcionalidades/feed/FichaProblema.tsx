import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { formatearFecha, haceCuanto } from '../../compartido/formato/fechas.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { DerivadoA } from '../mapa/DerivadoA.js';
import { EtiquetaEstado } from '../mapa/EtiquetaEstado.js';
import { ESTADOS, ORDEN_ESTADOS } from '../mapa/estados.js';
import type { FichaIncidente } from '../mapa/tipos.js';
import { useReportesDeIncidente } from './consultas.js';
import { Avatar, Carrusel, EtiquetaGravedad, NombreAutor, urlFoto } from './piezas.js';

// Lo que muestra el problema (el incidente): lo usan su ficha (PaginaIncidente) y cada publicación
// (PaginaReporte), que muestra el problema del que forma parte sin tener que ir a otra página.

const MapaPuntos = lazy(() => import('./MapaPuntos.js').then((modulo) => ({ default: modulo.MapaPuntos })));

/** Qué problema es: la categoría, el estado, la gravedad y a qué área se derivó. */
export function CabeceraProblema({
  ficha,
  titulo: Titulo = 'h1',
}: {
  ficha: FichaIncidente;
  titulo?: 'h1' | 'h2';
}) {
  return (
    <div className="flex flex-col gap-3">
      <Titulo className="text-2xl font-semibold">{ficha.categoria.nombre}</Titulo>
      <div className="flex flex-wrap gap-2">
        <EtiquetaEstado estado={ficha.estado} />
        {ficha.severidad && <EtiquetaGravedad gravedad={ficha.severidad} />}
      </div>
      <DerivadoA area={ficha.derivadoA} />
      {ficha.enRevision && (
        <p className="text-sm text-texto-secundario">
          Todavía no se verificó: puede cambiar de categoría o descartarse.
        </p>
      )}
    </div>
  );
}

/** El costado: dónde está, en un mapa chico que no se mueve, y los datos del problema. */
export function PanelUbicacion({ ficha }: { ficha: FichaIncidente }) {
  return (
    <aside aria-label="Información" className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-borde">
        <div className="h-48">
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-superficie-alterna" />}>
            <MapaPuntos
              fijo
              puntos={[
                {
                  id: ficha.id,
                  lat: ficha.lat,
                  lon: ficha.lon,
                  estado: ficha.estado,
                  titulo: ficha.categoria.nombre,
                },
              ]}
            />
          </Suspense>
        </div>
      </div>
      <div className="rounded-lg border border-borde bg-superficie-alterna p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-secundario">
          Información
        </h2>
        <dl className="flex flex-col gap-3 text-sm">
          {ficha.direccion && (
            <div>
              <dt className="text-texto-secundario">Dirección</dt>
              <dd>{ficha.direccion}</dd>
            </div>
          )}
          <div>
            <dt className="text-texto-secundario">Primer reporte</dt>
            <dd>{formatearFecha(ficha.primerReporteEn)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Vecinos que lo reportaron</dt>
            <dd>{ficha.cantidadVecinos}</dd>
          </div>
          {ficha.resueltoEn && (
            <div>
              <dt className="text-texto-secundario">Resuelto</dt>
              <dd>{formatearFecha(ficha.resueltoEn)}</dd>
            </div>
          )}
        </dl>
      </div>
    </aside>
  );
}

/**
 * Un incidente resuelto (F09): las fotos de los reportes (el antes) y la que lo cerró (el después), lado a lado
 * en pantalla ancha y una sobre la otra en el celular.
 */
export function AntesYDespues({
  fotos,
  despues,
  descripcion,
  resueltoEn,
}: {
  fotos: { id: number; url: string }[];
  despues: { id: number; url: string };
  descripcion: string;
  resueltoEn: string | null;
}) {
  return (
    <section aria-label="Antes y después" className="grid gap-px bg-borde sm:grid-cols-2">
      <figure className="flex flex-col bg-superficie-alterna">
        <figcaption className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
          Antes
        </figcaption>
        <Carrusel fotos={fotos} descripcion={`${descripcion}, antes`} />
      </figure>
      <figure className="flex flex-col bg-superficie-alterna">
        <figcaption className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
          Después{resueltoEn ? ` · resuelto el ${formatearFecha(resueltoEn)}` : ''}
        </figcaption>
        <img
          src={urlFoto(despues.id)}
          alt={`${descripcion}, después: cómo quedó al resolverse`}
          className="aspect-[4/3] w-full object-cover"
        />
      </figure>
    </section>
  );
}

/**
 * En qué está la atención del problema: los pasos de registrado a resuelto, con los ya cumplidos rellenos de su
 * color y el actual resaltado. Las fechas que se conocen (el primer reporte y la resolución) van debajo de su paso.
 */
export function RecorridoDelEstado({ ficha }: { ficha: FichaIncidente }) {
  const actual = ORDEN_ESTADOS.indexOf(ficha.estado);
  const fechas: Partial<Record<FichaIncidente['estado'], string | null>> = {
    REGISTRADO: ficha.primerReporteEn,
    RESUELTO: ficha.resueltoEn,
  };
  return (
    <section
      aria-label="Estado del problema"
      className="rounded-lg border border-borde bg-superficie-alterna p-4"
    >
      <h2 className="mb-4 text-xl font-semibold">Estado del problema</h2>
      <ol className="flex flex-col gap-0 sm:flex-row">
        {ORDEN_ESTADOS.map((estado, indice) => {
          const hecho = indice <= actual;
          const fecha = fechas[estado];
          return (
            <li
              key={estado}
              aria-current={indice === actual ? 'step' : undefined}
              className="flex flex-1 items-start gap-3 pb-4 sm:flex-col sm:items-center sm:pb-0 sm:text-center"
            >
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  hecho
                    ? `${ESTADOS[estado].clase} text-sobre-estado`
                    : 'border border-borde text-texto-secundario'
                } ${indice === actual ? 'ring-2 ring-primario ring-offset-2 ring-offset-superficie-alterna' : ''}`}
              >
                {indice + 1}
              </span>
              <span className="text-sm">
                <span className={hecho ? 'font-semibold text-texto' : 'text-texto-secundario'}>
                  {ESTADOS[estado].etiqueta}
                </span>
                <span className="sr-only">{hecho ? ' (cumplido)' : ' (pendiente)'}</span>
                {hecho && fecha && (
                  <span className="block text-xs text-texto-secundario">{formatearFecha(fecha)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Los vecinos que reportaron el mismo problema: una fila por reporte, que lleva a su publicación. */
export function ReportesDelProblema({ id }: { id: number }) {
  const reportes = useReportesDeIncidente(id);
  return (
    <section aria-label="Reportes de este problema" className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">
        {reportes.data ? `Reportes (${reportes.data.length})` : 'Reportes'}
      </h2>
      {reportes.isPending && <Cargando filas={2} />}
      {reportes.isError && (
        <AvisoError error={aErrorApi(reportes.error)} alReintentar={() => void reportes.refetch()} />
      )}
      {reportes.data && (
        <ul className="flex flex-col gap-2">
          {reportes.data.map((reporte) => (
            <li key={reporte.id}>
              <Link
                to={`/reporte/${reporte.id}`}
                className="flex items-center gap-3 rounded-lg border border-borde bg-superficie-alterna p-2 hover:bg-superficie focus-visible:ring-2 focus-visible:ring-primario"
              >
                {reporte.fotos[0] && (
                  <img
                    src={urlFoto(reporte.fotos[0].id)}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                  />
                )}
                <Avatar autor={reporte.autor} chico />
                <span className="min-w-0 flex-1 text-sm">
                  <NombreAutor autor={reporte.autor} />
                  <span className="block text-xs text-texto-secundario">{haceCuanto(reporte.creadoEn)}</span>
                </span>
                <span className="text-sm text-texto-secundario">
                  <span className="sr-only">
                    {reporte.cantidadMeGusta} me gusta, {reporte.cantidadComentarios} comentarios
                  </span>
                  <span aria-hidden="true">
                    ♥ {reporte.cantidadMeGusta} · 💬 {reporte.cantidadComentarios}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
