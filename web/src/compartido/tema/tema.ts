import { useCallback, useSyncExternalStore } from 'react';

export type Tema = 'claro' | 'oscuro';

// La misma clave que lee index.html antes de dibujar la página.
const CLAVE = 'snapit.tema';
const avisar = new Set<() => void>();

/** El tema que está aplicado: arranca en oscuro salvo que se haya elegido el claro. */
function temaActual(): Tema {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'oscuro';
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento (modo privado estricto): vale hasta recargar.
  }
  avisar.forEach((alCambiar) => alCambiar());
}

function suscribir(alCambiar: () => void) {
  avisar.add(alCambiar);
  return () => avisar.delete(alCambiar);
}

/** El tema y una función para pasar al otro. */
export function useTema() {
  const tema = useSyncExternalStore(suscribir, temaActual);
  const alternar = useCallback(() => aplicarTema(temaActual() === 'oscuro' ? 'claro' : 'oscuro'), []);
  return { tema, alternar };
}
