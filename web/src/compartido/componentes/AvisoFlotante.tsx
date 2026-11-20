import { useEffect, useState } from 'react';
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
 * con «Cerrar». Apenas llega se borra del estado de la navegación y queda solo en pantalla: el navegador guarda
 * ese estado al recargar, así que si quedara ahí, el aviso volvería a salir.
 */
export function AvisoFlotante() {
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const llegado = avisoDe(ubicacion.state);
  const { pathname, search, hash, key } = ubicacion;
  const [visible, setVisible] = useState<{ aviso: Aviso; navegacion: string } | null>(null);

  // Cada navegación con aviso lo muestra una vez. Se guarda durante el render, como se deriva un estado de otro.
  if (llegado && visible?.navegacion !== key) setVisible({ aviso: llegado, navegacion: key });

  const hayQueBorrar = llegado !== null;
  useEffect(() => {
    if (hayQueBorrar) void navegar({ pathname, search, hash }, { replace: true, state: null });
  }, [hayQueBorrar, navegar, pathname, search, hash]);

  const mostrado = visible?.navegacion;
  useEffect(() => {
    if (mostrado === undefined) return;
    const temporizador = setTimeout(() => setVisible(null), DURACION_MS);
    return () => clearTimeout(temporizador);
  }, [mostrado]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[2000] flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-borde bg-superficie-alterna px-4 py-3 shadow-md motion-safe:animate-aparecer-arriba"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto">{visible.aviso.titulo}</p>
          <p className="text-sm text-texto-secundario">{visible.aviso.texto}</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(null)}
          className="rounded-md px-3 py-1 text-sm font-semibold text-texto-secundario hover:bg-superficie hover:text-texto"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
