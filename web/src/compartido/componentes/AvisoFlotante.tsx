import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Un aviso corto que una pantalla le deja a la siguiente al navegar, por ejemplo «Reporte enviado». */
export interface Aviso {
  titulo: string;
  texto: string;
}

/** El estado de navegación que lleva un aviso: `navigate('/', { state: conAviso(...) })`. */
export const conAviso = (aviso: Aviso) => ({ aviso });

const DURACION_MS = 5000;

function avisoDe(estado: unknown): Aviso | null {
  if (typeof estado !== 'object' || estado === null || !('aviso' in estado)) return null;
  const { aviso } = estado as { aviso: Partial<Aviso> };
  return typeof aviso?.titulo === 'string' && typeof aviso.texto === 'string'
    ? { titulo: aviso.titulo, texto: aviso.texto }
    : null;
}

/**
 * El aviso que llegó con la navegación, arriba y al centro, sobre la página. Se va solo a los pocos segundos o
 * con la cruz. Al irse se borra del estado de la navegación: si se recarga la página, no vuelve a salir.
 */
export function AvisoFlotante() {
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const aviso = avisoDe(ubicacion.state);
  const { pathname, search, hash, key } = ubicacion;
  // Cada render arma otro objeto: el temporizador depende de si hay aviso y de qué navegación lo trajo.
  const hayAviso = aviso !== null;

  useEffect(() => {
    if (!hayAviso) return;
    const temporizador = setTimeout(
      () => void navegar({ pathname, search, hash }, { replace: true, state: null }),
      DURACION_MS,
    );
    return () => clearTimeout(temporizador);
  }, [hayAviso, key, navegar, pathname, search, hash]);

  if (!aviso) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[2000] flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-md animate-aparecer-arriba items-center gap-3 rounded-2xl border border-borde bg-superficie-alterna/95 px-4 py-3 shadow-lg backdrop-blur"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-estado-resuelto text-sm font-bold text-white"
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto">{aviso.titulo}</p>
          <p className="text-sm text-texto-secundario">{aviso.texto}</p>
        </div>
        <button
          type="button"
          aria-label="Cerrar el aviso"
          onClick={() => void navegar({ pathname, search, hash }, { replace: true, state: null })}
          className="rounded-md px-2 py-1 text-texto-secundario hover:bg-superficie"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
