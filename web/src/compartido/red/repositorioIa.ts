import type { ClienteApi } from './cliente.js';
import type { ProcesoCola, ProcesoReciente } from '../../funcionalidades/revision/tipos.js';

/** La cola de verificación con IA (docs/api.md, «Cola de verificación con IA»). */
export interface RepositorioIa {
  /** Empieza a procesar con la IA los pendientes del organismo. Sigue en el servidor: responde enseguida. */
  procesarCola(): Promise<{ procesoId: string; total: number }>;
  /** El log de un procesamiento, con su resumen. */
  proceso(id: string): Promise<ProcesoCola>;
  /** Los últimos procesamientos del organismo, del más nuevo al más viejo. */
  procesos(): Promise<ProcesoReciente[]>;
}

export function crearRepositorioIa(cliente: ClienteApi): RepositorioIa {
  return {
    procesarCola() {
      return cliente.pedir<{ procesoId: string; total: number }>('/ia/procesar-cola', { metodo: 'POST' });
    },
    proceso(id) {
      return cliente.pedir<ProcesoCola>(`/ia/procesos/${id}`);
    },
    async procesos() {
      const { procesos } = await cliente.pedir<{ procesos: ProcesoReciente[] }>('/ia/procesos');
      return procesos;
    },
  };
}
