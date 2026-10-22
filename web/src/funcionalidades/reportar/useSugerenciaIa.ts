import { useEffect, useMemo, useRef, useState } from 'react';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioIa } from '../../compartido/red/repositorioIa.js';
import type { SugerenciaIa } from './tipos.js';

export type EstadoSugerencia =
  | { tipo: 'sinFoto' }
  | { tipo: 'analizando' }
  | { tipo: 'lista'; sugerencia: SugerenciaIa }
  | { tipo: 'noDisponible' };

/**
 * Le pide a la IA la categoría y la gravedad de la foto que eligió el vecino (F06). Si la IA no responde, el
 * vecino elige a mano y el reporte se envía igual.
 */
export function useSugerenciaIa() {
  const cliente = useCliente();
  const ia = useMemo(() => crearRepositorioIa(cliente), [cliente]);
  const [estado, setEstado] = useState<EstadoSugerencia>({ tipo: 'sinFoto' });
  // Si el vecino cambia de foto mientras la IA analiza la anterior, esa respuesta se descarta.
  const ultima = useRef(0);
  // El pedido en curso se corta si cambia la foto, si el vecino envía o si sale de la pantalla.
  const enCurso = useRef<AbortController | null>(null);

  useEffect(() => () => enCurso.current?.abort(), []);

  async function pedir(foto: File | null): Promise<SugerenciaIa | null> {
    const pedido = ++ultima.current;
    enCurso.current?.abort();
    enCurso.current = null;
    if (!foto) {
      setEstado({ tipo: 'sinFoto' });
      return null;
    }
    const controlador = new AbortController();
    enCurso.current = controlador;
    setEstado({ tipo: 'analizando' });
    try {
      const sugerencia = await ia.clasificarFoto(foto, controlador.signal);
      if (pedido !== ultima.current) return null;
      setEstado({ tipo: 'lista', sugerencia });
      return sugerencia;
    } catch {
      if (pedido === ultima.current) setEstado({ tipo: 'noDisponible' });
      return null;
    }
  }

  return { estado, pedir, reiniciar: () => void pedir(null) };
}
