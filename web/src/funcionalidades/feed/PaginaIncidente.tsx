import { lazy, Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { formatearFecha } from '../../compartido/formato/fechas.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useFicha } from '../mapa/consultas.js';
import { EtiquetaEstado } from '../mapa/EtiquetaEstado.js';
import { useComentariosDeIncidente, useReportesDeIncidente } from './consultas.js';
import { Avatar, Carrusel, EtiquetaGravedad, SeccionComentarios, urlFoto } from './piezas.js';

const MapaPuntos = lazy(() => import('./MapaPuntos.js').then((modulo) => ({ default: modulo.MapaPuntos })));

/** El detalle de un incidente: sus fotos, sus datos, una foto por vecino y los comentarios del incidente. */
export function PaginaIncidente() {
  const id = Number(useParams().id);
  const ficha = useFicha(id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link to="/" className="self-start text-sm text-texto-secundario hover:text-texto">
        ← Volver al inicio
      </Link>

      {ficha.isPending && <Cargando filas={6} />}
      {ficha.isError && (
        <AvisoError
          error={aErrorApi(ficha.error)}
          alReintentar={() => void ficha.refetch()}
          reintentando={ficha.isFetching}
        />
      )}

      {ficha.data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-6">
            <article className="overflow-hidden rounded-lg border border-borde bg-superficie-alterna">
              <Carrusel fotos={ficha.data.fotos} descripcion={ficha.data.categoria.nombre} />
              <div className="flex flex-col gap-3 p-4">
                <h1 className="text-2xl font-semibold">{ficha.data.categoria.nombre}</h1>
                <div className="flex flex-wrap gap-2">
                  <EtiquetaEstado estado={ficha.data.estado} />
                  {ficha.data.severidad && <EtiquetaGravedad gravedad={ficha.data.severidad} />}
                </div>
                {ficha.data.enRevision && (
                  <p className="text-sm text-texto-secundario">
                    Todavía no se verificó: puede cambiar de categoría o descartarse.
                  </p>
                )}
              </div>
            </article>

            <FotosDeVecinos id={ficha.data.id} />
            <ComentariosDelIncidente id={ficha.data.id} />
          </div>

          <aside aria-label="Información" className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-borde">
              <div className="h-48">
                <Suspense fallback={<div className="h-full w-full animate-pulse bg-superficie-alterna" />}>
                  <MapaPuntos
                    fijo
                    puntos={[
                      {
                        id: ficha.data.id,
                        lat: ficha.data.lat,
                        lon: ficha.data.lon,
                        estado: ficha.data.estado,
                        titulo: ficha.data.categoria.nombre,
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
                {ficha.data.direccion && (
                  <div>
                    <dt className="text-texto-secundario">Dirección</dt>
                    <dd>{ficha.data.direccion}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-texto-secundario">Primer reporte</dt>
                  <dd>{formatearFecha(ficha.data.primerReporteEn)}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Vecinos que lo reportaron</dt>
                  <dd>{ficha.data.cantidadVecinos}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Una foto por vecino: al elegirla se abre con sus me gusta y comentarios. */
function FotosDeVecinos({ id }: { id: number }) {
  const reportes = useReportesDeIncidente(id);
  return (
    <section aria-label="Fotos de los vecinos" className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">
        {reportes.data ? `Fotos de los vecinos (${reportes.data.length})` : 'Fotos de los vecinos'}
      </h2>
      {reportes.isPending && <Cargando filas={2} />}
      {reportes.isError && (
        <AvisoError error={aErrorApi(reportes.error)} alReintentar={() => void reportes.refetch()} />
      )}
      {reportes.data && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {reportes.data.map((reporte) => (
            <li key={reporte.id}>
              <Link
                to={`/reporte/${reporte.id}`}
                aria-label={`Foto del ${reporte.autor.nombre}, ${reporte.cantidadMeGusta} me gusta, ${reporte.cantidadComentarios} comentarios`}
                className="relative block aspect-square overflow-hidden rounded-lg border border-borde bg-superficie-alterna focus-visible:ring-2 focus-visible:ring-primario"
              >
                {reporte.fotos[0] && (
                  <img
                    src={urlFoto(reporte.fotos[0].id)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                {/* Una franja con velo abajo, para que el autor se lea sobre cualquier foto. */}
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-velo p-2 text-xs text-sobre-velo">
                  <Avatar autor={reporte.autor} chico />
                  <span className="min-w-0 flex-1 truncate">{reporte.autor.nombre}</span>
                  <span aria-hidden="true">♥ {reporte.cantidadMeGusta}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ComentariosDelIncidente({ id }: { id: number }) {
  const comentarios = useComentariosDeIncidente(id);
  return (
    <div className="rounded-lg border border-borde bg-superficie-alterna p-4">
      <SeccionComentarios
        titulo="Comentarios del incidente"
        comentarios={comentarios.data}
        cargando={comentarios.isPending}
        error={comentarios.isError ? aErrorApi(comentarios.error) : null}
        alReintentar={() => void comentarios.refetch()}
      />
    </div>
  );
}
