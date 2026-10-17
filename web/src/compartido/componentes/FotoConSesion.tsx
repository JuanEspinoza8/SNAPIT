import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCliente } from '../red/clienteContexto.js';

interface Props {
  fotoId: number;
  /** Medidas y bordes: se usan en la foto y en el recuadro mientras carga. */
  className: string;
  /** Lo que queda en su lugar si la foto no se puede bajar o mostrar. */
  siFalla: ReactNode;
}

/**
 * Una foto que el servidor solo da con sesión: la de un reporte propio, o la de un incidente del
 * organismo para el operador (docs/api.md, `GET /api/fotos/:id`). Un `<img src>` no manda el
 * token, así que se baja con el cliente y se muestra desde una URL local.
 */
export function FotoConSesion({ fotoId, className, siFalla }: Props) {
  const cliente = useCliente();
  const { data: archivo, isError } = useQuery({
    queryKey: ['foto', fotoId],
    queryFn: () => cliente.pedir<Blob>(`/fotos/${fotoId}`, { comoArchivo: true }),
    // El archivo de una foto no cambia: mientras siga en memoria no se vuelve a bajar.
    staleTime: Infinity,
  });
  const [noSeMuestra, setNoSeMuestra] = useState(false);

  // La URL local se crea al montar la imagen y se libera al desmontarla. Va en el ref y no en un
  // efecto aparte para que la imagen nunca quede con una URL ya liberada.
  const mostrar = useCallback(
    (imagen: HTMLImageElement | null) => {
      if (!imagen || !archivo) return;
      const url = URL.createObjectURL(archivo);
      imagen.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [archivo],
  );

  if (isError || noSeMuestra) return siFalla;
  if (!archivo) {
    return <span aria-hidden="true" className={`${className} animate-pulse bg-superficie-alterna`} />;
  }
  return <img ref={mostrar} alt="" onError={() => setNoSeMuestra(true)} className={className} />;
}
