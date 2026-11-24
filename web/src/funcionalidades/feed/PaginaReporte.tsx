import { Link, useParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { formatearFecha, haceCuanto } from '../../compartido/formato/fechas.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useFicha } from '../mapa/consultas.js';
import type { FichaIncidente } from '../mapa/tipos.js';
import { useReporte } from './consultas.js';
import { CabeceraProblema, PanelUbicacion, RecorridoDelEstado } from './FichaProblema.js';
import { BotonMeGusta, SeccionComentarios } from './Interacciones.js';
import { QuitarPublicacion } from './QuitarPublicacion.js';
import { Avatar, Carrusel, NombreAutor, urlFoto } from './piezas.js';

/**
 * Una publicación entera: quién la hizo, la foto, el me gusta y todos los comentarios (#151), y además el problema
 * del que forma parte (qué es, en qué está, el mapa y sus datos), para no tener que ir a otra página. Si lo
 * reportaron otros vecinos, un enlace lleva a la ficha del problema con todos sus reportes.
 */
export function PaginaReporte() {
  const id = Number(useParams().id);
  const reporte = useReporte(id);
  // El problema se pide recién cuando se sabe cuál es.
  const ficha = useFicha(reporte.data?.incidenteId ?? null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link to="/" className="self-start text-sm text-texto-secundario hover:text-texto">
        ← Volver al inicio
      </Link>

      {reporte.isPending && <Cargando filas={6} />}
      {reporte.isError && aErrorApi(reporte.error).codigo === 'REPORTE_QUITADO' && (
        // El link a una publicación que quitó un administrador lo dice, con el motivo: no es un error.
        <section aria-label="Publicación eliminada" className="tarjeta flex flex-col gap-2 p-6">
          <h1 className="text-lg font-semibold text-texto">Publicación eliminada por un administrador</h1>
          <p className="text-sm text-texto-secundario">{aErrorApi(reporte.error).mensaje}</p>
        </section>
      )}
      {reporte.isError && aErrorApi(reporte.error).codigo !== 'REPORTE_QUITADO' && (
        <AvisoError
          error={aErrorApi(reporte.error)}
          alReintentar={() => void reporte.refetch()}
          reintentando={reporte.isFetching}
        />
      )}

      {reporte.data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-6">
            <article className="tarjeta overflow-hidden">
              <header className="flex items-center gap-3 p-4">
                <Avatar autor={reporte.data.autor} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Reporte del <NombreAutor autor={reporte.data.autor} />
                  </p>
                  <p className="text-sm text-texto-secundario">{haceCuanto(reporte.data.creadoEn)}</p>
                </div>
                <QuitarPublicacion reporteId={reporte.data.id} />
              </header>
              <Carrusel
                fotos={reporte.data.fotos}
                descripcion={`el reporte del ${reporte.data.autor.nombre}`}
              />
              <div className="flex flex-col gap-4 p-4">
                <BotonMeGusta reporte={reporte.data} />
                {reporte.data.descripcion?.trim() && (
                  <p className="break-words">{reporte.data.descripcion}</p>
                )}
                {ficha.data && <CabeceraProblema ficha={ficha.data} />}
              </div>
            </article>

            {ficha.isError && (
              <AvisoError error={aErrorApi(ficha.error)} alReintentar={() => void ficha.refetch()} />
            )}
            {ficha.data?.fotoCierre && <ComoQuedo ficha={ficha.data} fotoId={ficha.data.fotoCierre.id} />}
            {ficha.data && <RecorridoDelEstado ficha={ficha.data} />}
            {ficha.data && ficha.data.cantidadVecinos > 1 && <OtrosVecinos ficha={ficha.data} />}

            <div className="tarjeta p-4">
              <SeccionComentarios sobre={{ tipo: 'reporte', id: reporte.data.id }} />
            </div>
          </div>

          {ficha.data && <PanelUbicacion ficha={ficha.data} />}
        </div>
      )}
    </div>
  );
}

/** Si el problema se resolvió: la foto que lo cerró, para compararla con la del vecino. */
function ComoQuedo({ ficha, fotoId }: { ficha: FichaIncidente; fotoId: number }) {
  return (
    <figure className="tarjeta overflow-hidden">
      <figcaption className="px-4 py-3 text-sm font-semibold">
        Así quedó{ficha.resueltoEn ? ` · resuelto el ${formatearFecha(ficha.resueltoEn)}` : ''}
      </figcaption>
      <img
        src={urlFoto(fotoId)}
        alt={`${ficha.categoria.nombre}, después: cómo quedó al resolverse`}
        className="aspect-[4/3] w-full object-cover"
      />
    </figure>
  );
}

/** Lo reportaron otros vecinos: la ficha del problema junta todos sus reportes. */
function OtrosVecinos({ ficha }: { ficha: FichaIncidente }) {
  const otros = ficha.cantidadVecinos - 1;
  return (
    <Link
      to={`/incidente/${ficha.id}`}
      className="tarjeta flex items-center justify-between gap-3 p-4 hover:border-primario/50 focus-visible:ring-2 focus-visible:ring-primario"
    >
      <span>
        {otros === 1
          ? 'Otro vecino reportó este problema'
          : `Otros ${otros} vecinos reportaron este problema`}
      </span>
      <span className="text-sm font-semibold">Ver todos →</span>
    </Link>
  );
}
