import { useEffect, useRef } from 'react';

/**
 * En pantallas angostas el panel de la derecha queda debajo del mapa: al abrirlo se lo trae a la
 * vista. El foco también va al panel, así con el teclado se sigue desde ahí.
 */
export function useTraerALaVista(cadaVezQueCambia: unknown) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView?.({ block: 'nearest' });
    panel.current?.focus();
  }, [cadaVezQueCambia]);
  return panel;
}
