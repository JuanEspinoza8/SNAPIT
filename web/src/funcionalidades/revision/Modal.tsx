import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  /** Si no se pasa, el contenido trae su propio encabezado y su botón para cerrar (por ejemplo, la ficha). */
  titulo?: string;
  ancho?: string;
  alCerrar: () => void;
  children: ReactNode;
}

/**
 * Una ventana encima de la página, con el `<dialog>` del navegador: lleva el foco adentro, se cierra con Esc o
 * tocando afuera, y oscurece el fondo. Mientras está abierta, lo de abajo sigue actualizándose.
 */
export function Modal({ titulo, ancho = 'max-w-3xl', alCerrar, children }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento || elemento.open) return;
    // jsdom (los tests) no implementa showModal: ahí alcanza con marcarlo abierto.
    if (typeof elemento.showModal === 'function') elemento.showModal();
    else elemento.setAttribute('open', '');
    return () => elemento?.close?.();
  }, []);

  return (
    <dialog
      ref={dialogo}
      aria-label={titulo}
      // Esc: el navegador lo cerraría solo; se avisa para que el estado de la página quede igual.
      onCancel={(evento) => {
        evento.preventDefault();
        alCerrar();
      }}
      // Un clic en el fondo oscuro llega al propio <dialog>, no a su contenido.
      onClick={(evento) => {
        if (evento.target === dialogo.current) alCerrar();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${ancho} rounded-lg border border-borde bg-superficie p-0 text-texto shadow-xl backdrop:bg-black/40`}
    >
      <div className="max-h-[85dvh] overflow-y-auto p-5">
        {titulo && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className="rounded-md px-2 text-xl leading-none text-texto-secundario hover:bg-superficie-alterna hover:text-texto"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
