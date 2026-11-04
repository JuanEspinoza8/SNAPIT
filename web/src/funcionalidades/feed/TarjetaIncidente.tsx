import { Link } from 'react-router-dom';
import { haceCuanto } from '../../compartido/formato/fechas.js';
import { EtiquetaEstado } from '../mapa/EtiquetaEstado.js';
import { Carrusel, Contadores, EtiquetaGravedad } from './piezas.js';
import type { TarjetaFeed } from './tipos.js';

interface Props {
  tarjeta: TarjetaFeed;
  /** Avisa cuando el mouse o el foco entran o salen, para resaltarla en el mapa. */
  alResaltar?: (id: number | null) => void;
}

/**
 * Un incidente en el feed: la foto a todo el ancho y los datos abajo. Si lo reportaron varios vecinos, es
 * el «post destacado» que los agrupa. La parte de abajo es el enlace al detalle; la foto no, para que pasar
 * las fotos no lo abra sin querer.
 */
export function TarjetaIncidente({ tarjeta, alResaltar }: Props) {
  const agrupado = tarjeta.cantidadReportes > 1;
  return (
    <article
      aria-label={tarjeta.categoria.nombre}
      onMouseEnter={() => alResaltar?.(tarjeta.id)}
      onMouseLeave={() => alResaltar?.(null)}
      onFocus={() => alResaltar?.(tarjeta.id)}
      onBlur={() => alResaltar?.(null)}
      className="overflow-hidden rounded-xl border border-borde bg-superficie-alterna"
    >
      <Carrusel fotos={tarjeta.fotos} total={tarjeta.cantidadFotos} descripcion={tarjeta.categoria.nombre} />
      <Link
        to={`/incidente/${tarjeta.id}`}
        className="flex flex-col gap-3 p-4 outline-none hover:bg-superficie focus-visible:ring-2 focus-visible:ring-primario"
      >
        {agrupado && (
          <p className="text-sm font-semibold text-primario">
            Agrupado · {tarjeta.cantidadReportes} reportes del mismo problema
          </p>
        )}
        <div>
          <h2 className="text-base font-semibold text-texto">{tarjeta.categoria.nombre}</h2>
          {tarjeta.direccion && <p className="text-sm text-texto-secundario">📍 {tarjeta.direccion}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <EtiquetaEstado estado={tarjeta.estado} />
          <EtiquetaGravedad gravedad={tarjeta.severidad} />
        </div>
        <p className="text-sm text-texto-secundario">
          {tarjeta.cantidadVecinos === 1
            ? 'Lo reportó 1 vecino'
            : `Lo reportaron ${tarjeta.cantidadVecinos} vecinos`}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Contadores meGusta={tarjeta.cantidadMeGusta} comentarios={tarjeta.cantidadComentarios} />
          <span className="text-sm text-texto-secundario">{haceCuanto(tarjeta.primerReporteEn)}</span>
        </div>
      </Link>
    </article>
  );
}
