import { EtiquetaEstado } from '../mapa/EtiquetaEstado.js';
import type { EstadoIncidente } from './tipos.js';

/** El estado del reporte con su texto. Reusa la etiqueta del mapa y agrega «Desestimado», que el mapa no muestra. */
export function EtiquetaReporte({ estado }: { estado: EstadoIncidente }) {
  if (estado === 'DESESTIMADO') {
    return (
      <span className="bg-estado-desestimado rounded-md px-2 py-0.5 text-xs font-semibold text-sobre-primario">
        Desestimado
      </span>
    );
  }
  return <EtiquetaEstado estado={estado} />;
}
