import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { haceCuanto } from '../../compartido/formato/fechas.js';
import { DerivadoA } from '../mapa/DerivadoA.js';
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
 * fotos). Con el teclado se entra por el nombre del autor, que es un enlace. Al pasar el mouse se marca el borde, y
 * cuando pasa por el centro de la pantalla al scrollear se agranda apenas.
 */
export function Publicacion({ publicacion: p, alResaltar }: Props) {
  const navegar = useNavigate();
  const tarjeta = useRef<HTMLElement>(null);
  const enElCentro = useEnElCentro(tarjeta);
  const resuelto = p.incidente.estado === 'RESUELTO';
  const vecinos = p.incidente.cantidadVecinos;
  const comentarios = p.cantidadComentarios;

  function abrir(evento: MouseEvent<HTMLElement>) {
    if ((evento.target as HTMLElement).closest('a, button, input, textarea')) return;
    void navegar(`/reporte/${p.id}`);
  }

  return (
    <article
      ref={tarjeta}
      aria-label={`${p.categoria.nombre}, reporte del ${p.autor.nombre}`}
      onClick={abrir}
      onMouseEnter={() => alResaltar?.(p.id)}
      onMouseLeave={() => alResaltar?.(null)}
      onFocus={() => alResaltar?.(p.id)}
      onBlur={() => alResaltar?.(null)}
      className={`cursor-pointer overflow-hidden rounded-lg border border-borde bg-superficie-alterna transition duration-300 ease-out hover:border-primario/50 hover:shadow-lg ${
        enElCentro ? 'motion-safe:scale-[1.01] shadow-md' : ''
      }`}
    >
      <header className="flex items-center gap-3 p-3">
        <Avatar autor={p.autor} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link
              to={`/reporte/${p.id}`}
              aria-label={`Ver el reporte del ${p.autor.nombre}`}
              className="hover:underline focus-visible:outline-2 focus-visible:outline-primario"
            >
              <NombreAutor autor={p.autor} />
            </Link>
          </p>
          <p className="truncate text-xs text-texto-secundario">
            {haceCuanto(p.creadoEn)}
            {p.direccion && ` · ${p.direccion}`}
          </p>
        </div>
        {resuelto && (
          <span className="rounded-md bg-estado-resuelto px-2 py-0.5 text-xs font-semibold text-sobre-estado">
            ✓ Resuelto
          </span>
        )}
      </header>

      <Carrusel fotos={p.fotos} descripcion={`${p.categoria.nombre}, reporte del ${p.autor.nombre}`} />

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <BotonMeGusta reporte={p} />
          <Link
            to={`/reporte/${p.id}`}
            aria-label={comentarios === 1 ? 'Ver 1 comentario' : `Ver ${comentarios} comentarios`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-texto-secundario hover:bg-superficie"
          >
            <span aria-hidden="true">💬</span> {comentarios}
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-texto">{p.categoria.nombre}</h2>
            <EtiquetaGravedad gravedad={p.severidad} />
          </div>
          <DerivadoA area={p.derivadoA} />
          {p.descripcion?.trim() && <p className="break-words">{p.descripcion}</p>}
          {comentarios > 0 && (
            <Link
              to={`/reporte/${p.id}`}
              className="self-start text-sm text-texto-secundario hover:text-texto"
            >
              {comentarios === 1 ? 'Ver el comentario' : `Ver los ${comentarios} comentarios`}
            </Link>
          )}
        </div>

        {/* Con varios vecinos, la línea lleva a la ficha que junta sus reportes. Con uno solo, todo el
            problema ya está en la publicación: solo dice en qué estado está. */}
        {vecinos > 1 ? (
          <Link
            to={`/incidente/${p.incidente.id}`}
            className="flex flex-wrap items-center gap-2 rounded-md border border-borde px-3 py-2 text-sm hover:bg-superficie focus-visible:ring-2 focus-visible:ring-primario"
          >
            <span aria-hidden="true">🔗</span>
            <span className="text-texto-secundario">{vecinos} vecinos reportaron este problema</span>
            <EtiquetaEstado estado={p.incidente.estado} />
          </Link>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-texto-secundario">Estado del problema</span>
            <EtiquetaEstado estado={p.incidente.estado} />
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Si la tarjeta está pasando por la franja del medio de la pantalla. Sin IntersectionObserver (navegadores viejos,
 * los tests) queda en false: la tarjeta se ve igual, sin el efecto.
 */
function useEnElCentro(elemento: RefObject<HTMLElement | null>) {
  const [enElCentro, setEnElCentro] = useState(false);
  useEffect(() => {
    const actual = elemento.current;
    if (!actual || typeof IntersectionObserver === 'undefined') return;
    const observador = new IntersectionObserver(
      ([entrada]) => setEnElCentro(entrada?.isIntersecting ?? false),
      // Solo cuenta el 20 % del medio de la pantalla.
      { rootMargin: '-40% 0px -40% 0px' },
    );
    observador.observe(actual);
    return () => observador.disconnect();
  }, [elemento]);
  return enElCentro;
}
