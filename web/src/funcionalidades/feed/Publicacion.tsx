import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { haceCuanto } from '../../compartido/formato/fechas.js';
import {
  IconoArea,
  IconoComentario,
  IconoUbicacion,
  IconoVecinos,
} from '../../compartido/componentes/Iconos.js';
import { EtiquetaEstado } from '../mapa/EtiquetaEstado.js';
import { BotonMeGusta } from './Interacciones.js';
import { Avatar, Carrusel, EtiquetaGravedad, NombreAutor } from './piezas.js';
import type { Publicacion as Datos } from './tipos.js';

interface Props {
  publicacion: Datos;
  /** Avisa cuando el mouse o el foco entran o salen, para resaltarla en el mapa. */
  alResaltar?: (id: number | null) => void;
}

/**
 * Un reporte publicado en el feed, como un posteo: quién lo hizo, la foto, el me gusta y los comentarios, qué
 * problema es y a qué área se derivó. Abajo, la línea a su incidente: el problema en general, con su estado y
 * cuántos vecinos lo reportaron. Si se resolvió, lo dice arriba de todo.
 *
 * Toda la tarjeta abre la publicación, salvo lo que ya hace otra cosa (el me gusta, los enlaces, las flechas de las
 * fotos). Con el teclado se entra por el nombre del autor, que es un enlace. Al pasar el mouse se marca el borde.
 */
export function Publicacion({ publicacion: p, alResaltar }: Props) {
  const navegar = useNavigate();
  const resuelto = p.incidente.estado === 'RESUELTO';
  const vecinos = p.incidente.cantidadVecinos;
  const comentarios = p.cantidadComentarios;

  function abrir(evento: MouseEvent<HTMLElement>) {
    if ((evento.target as HTMLElement).closest('a, button, input, textarea')) return;
    void navegar(`/reporte/${p.id}`);
  }

  return (
    <article
      aria-label={`${p.categoria.nombre}, reporte del ${p.autor.nombre}`}
      onClick={abrir}
      onMouseEnter={() => alResaltar?.(p.id)}
      onMouseLeave={() => alResaltar?.(null)}
      onFocus={() => alResaltar?.(p.id)}
      onBlur={() => alResaltar?.(null)}
      className="tarjeta cursor-pointer overflow-hidden transition-colors duration-200 hover:border-primario/50"
    >
      {/* Nivel 1, la tarjeta: quién, cuándo y dónde, qué cuenta, y la foto. */}
      <header className="flex items-start gap-3 p-4 pb-3">
        <Avatar autor={p.autor} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Link
              to={`/reporte/${p.id}`}
              aria-label={`Ver el reporte del ${p.autor.nombre}`}
              className="text-base hover:underline focus-visible:outline-2 focus-visible:outline-primario"
            >
              <NombreAutor autor={p.autor} />
            </Link>
            <span className="text-texto-secundario">{haceCuanto(p.creadoEn)}</span>
          </p>
          {p.direccion && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-texto-secundario">
              <IconoUbicacion className="h-3.5 w-3.5" />
              <span className="truncate">{p.direccion}</span>
            </p>
          )}
        </div>
        {resuelto && (
          <span className="rounded-md bg-estado-resuelto px-2 py-0.5 text-xs font-semibold text-sobre-estado">
            Resuelto
          </span>
        )}
      </header>

      {p.descripcion?.trim() && <p className="break-words px-4 pb-3 text-texto">{p.descripcion}</p>}

      <Carrusel fotos={p.fotos} descripcion={`${p.categoria.nombre}, reporte del ${p.autor.nombre}`} />

      {/* Nivel 2, la barra de acciones: una franja clara entre la foto y el detalle. */}
      <div className="flex items-center gap-2 border-y border-borde-tarjeta bg-superficie px-3 py-1.5">
        <BotonMeGusta reporte={p} />
        <Link
          to={`/reporte/${p.id}`}
          aria-label={comentarios === 1 ? 'Ver 1 comentario' : `Ver ${comentarios} comentarios`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-texto-secundario hover:bg-superficie-alterna"
        >
          <IconoComentario /> {comentarios}
        </Link>
        {comentarios > 0 && (
          <Link
            to={`/reporte/${p.id}`}
            className="ml-auto text-sm text-texto-secundario hover:text-texto hover:underline"
          >
            {comentarios === 1 ? 'Ver el comentario' : `Ver los ${comentarios} comentarios`}
          </Link>
        )}
      </div>

      {/* Nivel 3, el problema: un panel con su propio fondo y borde, dentro de la tarjeta. */}
      <div className="p-3">
        <div className="flex flex-col gap-2 rounded-md border border-borde bg-superficie p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-texto">{p.categoria.nombre}</h2>
            <EtiquetaGravedad gravedad={p.severidad} />
          </div>
          {p.derivadoA && (
            <p className="flex items-center gap-1.5 text-sm text-texto-secundario">
              <IconoArea />
              <span>
                Le corresponde al área de{' '}
                <span className="font-semibold text-texto">{p.derivadoA.nombre}</span>
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Abajo, el estado en una franja más oscura. Con varios vecinos, lleva a la ficha que junta sus
          reportes; con uno solo, todo el problema ya está en la publicación. */}
      {vecinos > 1 ? (
        <Link
          to={`/incidente/${p.incidente.id}`}
          className="flex flex-wrap items-center gap-2 border-t border-borde-tarjeta bg-fila-alterna px-4 py-2.5 text-sm hover:bg-fila-resaltada focus-visible:ring-2 focus-visible:ring-primario"
        >
          <IconoVecinos className="h-4 w-4 text-texto-secundario" />
          <span className="text-texto-secundario">{vecinos} vecinos reportaron este problema</span>
          <EtiquetaEstado estado={p.incidente.estado} />
        </Link>
      ) : (
        <p className="flex flex-wrap items-center gap-2 border-t border-borde-tarjeta bg-fila-alterna px-4 py-2.5 text-sm">
          <span className="text-texto-secundario">Estado del problema</span>
          <EtiquetaEstado estado={p.incidente.estado} />
        </p>
      )}
    </article>
  );
}
