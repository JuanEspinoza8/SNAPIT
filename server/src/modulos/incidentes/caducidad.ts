import { logger } from '../../config/logger.js';
import { transaccion } from '../reportes/repositorio.js';
import { registrarMovimiento } from './bitacora.js';
import { marcarCaducado } from './repositorio.js';

export interface ResumenCaducidad {
  total: number;
  caducados: number;
  /** Los que se cerraron, se unieron a otro o ya estaban marcados cuando les tocó el turno. */
  salteados: number;
  fallidos: number;
  duracionMs: number;
}

/**
 * Caduca los incidentes vencidos (F12), cada uno en su propia transacción: si uno falla, se deja el error en el
 * log y se sigue con los demás. Cada uno deja un movimiento del sistema en la bitácora. No se recalcula la
 * prioridad (ya no está en la bandeja) ni se avisa al vecino. Lo usa la tarea diaria (tareas/caducidadDiaria.ts).
 */
export async function caducarIncidentes(ids: number[]): Promise<ResumenCaducidad> {
  const inicio = performance.now();
  let caducados = 0;
  let fallidos = 0;
  for (const id of ids) {
    try {
      const caduco = await transaccion(async (tx) => {
        // Si otra corrida ya lo marcó, no se marca de nuevo y el movimiento no se repite.
        if (!(await marcarCaducado(tx, id))) return false;
        await registrarMovimiento(tx, {
          incidenteId: id,
          tipo: 'COMENTARIO',
          comentario: 'Caducó: venció su vigencia.',
        });
        return true;
      });
      if (caduco) caducados++;
    } catch (error) {
      fallidos++;
      logger.error({ err: error, incidenteId: id }, `No se pudo caducar el incidente ${id}`);
    }
  }
  return {
    total: ids.length,
    caducados,
    salteados: ids.length - caducados - fallidos,
    fallidos,
    duracionMs: Math.round(performance.now() - inicio),
  };
}
