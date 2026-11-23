import type { ClienteApi } from './cliente.js';
import type { Informe, PedidoInforme, ResumenInforme } from '../../funcionalidades/informes/tipos.js';

/** Los informes de estado y prioridades (F14, docs/api.md). */
export interface RepositorioInformes {
  /** Espera a la IA: puede tardar. */
  generar(pedido: PedidoInforme): Promise<Informe>;
  historial(): Promise<ResumenInforme[]>;
  informe(id: number): Promise<Informe>;
  pdf(id: number): Promise<Blob>;
  /** Los barrios con incidentes en el mapa: los que acepta el filtro `barrio`. */
  barrios(): Promise<string[]>;
}

export function crearRepositorioInformes(cliente: ClienteApi): RepositorioInformes {
  return {
    async generar(pedido) {
      const { informe } = await cliente.pedir<{ informe: Informe }>('/informes', {
        metodo: 'POST',
        cuerpo: pedido,
      });
      return informe;
    },
    async historial() {
      const { informes } = await cliente.pedir<{ informes: ResumenInforme[] }>('/informes');
      return informes;
    },
    async informe(id) {
      const { informe } = await cliente.pedir<{ informe: Informe }>(`/informes/${id}`);
      return informe;
    },
    pdf(id) {
      return cliente.pedir<Blob>(`/informes/${id}/pdf`, { comoArchivo: true });
    },
    async barrios() {
      const { barrios } = await cliente.pedir<{ barrios: string[] }>('/barrios', { sinSesion: true });
      return barrios;
    },
  };
}
