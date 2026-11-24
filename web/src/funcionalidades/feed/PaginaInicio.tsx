import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { BotonReportar } from '../../compartido/componentes/BotonReportar.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useFeed } from './consultas.js';
import { Publicacion } from './Publicacion.js';

// Leaflet es pesado y en un celular el mapa ni se muestra: se baja recién si hay lugar para él.
const MapaPuntos = lazy(() => import('./MapaPuntos.js').then((modulo) => ({ default: modulo.MapaPuntos })));

// El mismo corte que `lg:` de Tailwind. Sin matchMedia (jsdom, navegadores viejos) no hay mapa.
const ANCHA = '(min-width: 1024px)';
const suscribirAncho = (alCambiar: () => void) => {
  const consulta = window.matchMedia?.(ANCHA);
  consulta?.addEventListener('change', alCambiar);
  return () => consulta?.removeEventListener('change', alCambiar);
};
const esAncha = () => window.matchMedia?.(ANCHA).matches ?? false;

/**
 * La pantalla de inicio: lo que reportaron los vecinos, una publicación debajo de la otra, de la más nueva a la más
 * vieja (solo los reportes ya publicados). En pantalla ancha, al lado, un mapa con las que ya se cargaron. Al acercarse al final pide la página
 * siguiente; el botón «Cargar más» queda para el teclado y para los navegadores sin IntersectionObserver.
 */
export function PaginaInicio() {
  const feed = useFeed();
  const navegar = useNavigate();
  const [resaltado, setResaltado] = useState<number | null>(null);
  const ancha = useSyncExternalStore(suscribirAncho, esAncha);
  const final = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError } = feed;

  useEffect(() => {
    const marca = final.current;
    // Si la página siguiente falló, no se vuelve a pedir sola: se reintenta con el botón.
    if (!marca || !hasNextPage || isFetchNextPageError || typeof IntersectionObserver === 'undefined') return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    observador.observe(marca);
    return () => observador.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const publicaciones = feed.data?.pages.flatMap((pagina) => pagina.reportes) ?? [];
  const puntos = publicaciones.map((p) => ({
    id: p.id,
    lat: p.lat,
    lon: p.lon,
    estado: p.incidente.estado,
    titulo: p.categoria.nombre,
  }));

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,36rem)_1fr]">
      <section aria-label="Publicaciones de los vecinos" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Inicio</h1>
          <BotonReportar />
        </div>

        {feed.isPending && <Cargando filas={6} />}

        {feed.isError && !feed.data && (
          <AvisoError
            error={aErrorApi(feed.error)}
            alReintentar={() => void feed.refetch()}
            reintentando={feed.isFetching}
          />
        )}

        {feed.data && publicaciones.length === 0 && (
          <div className="tarjeta p-8 text-center">
            <p className="font-semibold">Todavía no hay publicaciones</p>
            <p className="text-sm text-texto-secundario">
              Cuando se publique el reporte de un vecino, va a aparecer acá.
            </p>
          </div>
        )}

        {publicaciones.length > 0 && (
          <ol className="flex flex-col gap-6">
            {publicaciones.map((publicacion) => (
              <li key={publicacion.id}>
                <Publicacion publicacion={publicacion} alResaltar={setResaltado} />
              </li>
            ))}
          </ol>
        )}

        <div ref={final} className="flex flex-col items-center gap-3 py-4">
          {isFetchNextPageError && <AvisoError error={aErrorApi(feed.error)} />}
          {hasNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="rounded-md border border-borde px-4 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna disabled:text-texto-secundario"
            >
              {isFetchingNextPage ? 'Cargando más…' : isFetchNextPageError ? 'Reintentar' : 'Cargar más'}
            </button>
          )}
          {feed.data && !hasNextPage && publicaciones.length > 0 && (
            <p className="text-sm text-texto-secundario">No hay más publicaciones por ahora</p>
          )}
        </div>
      </section>

      {/* Solo en pantalla ancha. Para el lector de pantalla es un extra: la lista ya tiene todo. */}
      {ancha && (
        <aside aria-label="Mapa de las publicaciones del inicio">
          <div className="tarjeta sticky top-4 h-[calc(100dvh-8rem)] overflow-hidden">
            {puntos.length > 0 && (
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-superficie-alterna" />}>
                <MapaPuntos
                  puntos={puntos}
                  destacado={resaltado}
                  alElegir={(id) => void navegar(`/reporte/${id}`)}
                />
              </Suspense>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
