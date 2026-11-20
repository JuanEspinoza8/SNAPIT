import { useEffect, useRef } from 'react';

/**
 * El foco de una confirmación en línea («¿Eliminar…?»): al abrirse va al botón de confirmar, y al cerrarse vuelve
 * al botón que la abrió. Sin esto, con el teclado o el lector de pantalla el foco se pierde cuando los botones
 * cambian. `botonAbrir` va en el botón que la abre y `botonConfirmar` en el que confirma.
 */
export function useFocoConfirmacion(abierta: boolean) {
  const botonAbrir = useRef<HTMLButtonElement>(null);
  const botonConfirmar = useRef<HTMLButtonElement>(null);
  const estabaAbierta = useRef(abierta);

  useEffect(() => {
    if (abierta) botonConfirmar.current?.focus();
    else if (estabaAbierta.current) botonAbrir.current?.focus();
    estabaAbierta.current = abierta;
  }, [abierta]);

  return { botonAbrir, botonConfirmar };
}
