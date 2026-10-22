import cron from 'node-cron';
import { logger } from '../config/logger.js';
import { listarAbiertos } from '../modulos/prioridad/repositorio.js';
import { recalcularIncidentes } from '../modulos/prioridad/servicio.js';

export const HORARIO = '0 3 * * *';
// Sin la zona, en Docker (que usa UTC) correría a las 00:00 de acá.
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

/**
 * Recalcula la prioridad de los incidentes abiertos: la antigüedad cambia todos los días (F07). Devuelve el
 * resumen, o null si ni siquiera se pudo pedir la lista.
 */
export async function correrPrioridadDiaria() {
  try {
    const resumen = await recalcularIncidentes(await listarAbiertos());
    const { total, recalculados, salteados, fallidos, duracionMs } = resumen;
    const aclaraciones = [
      salteados > 0 && `${salteados} ya no ${salteados === 1 ? 'estaba abierto' : 'estaban abiertos'}`,
      fallidos > 0 && `${fallidos} ${fallidos === 1 ? 'falló' : 'fallaron'}`,
    ].filter(Boolean);
    const detalle = aclaraciones.length > 0 ? ` (${aclaraciones.join(', ')})` : '';
    logger.info(
      resumen,
      `Prioridad diaria: se recalcularon ${recalculados} de ${total} incidentes en ${duracionMs} ms${detalle}`,
    );
    return resumen;
  } catch (error) {
    logger.error({ err: error }, 'Falló el recálculo diario de prioridad');
    return null;
  }
}

/** Corre al arrancar, por si el servidor estaba apagado a las 03:00, y después todos los días a esa hora. */
export function iniciarPrioridadDiaria() {
  void correrPrioridadDiaria();
  return cron.schedule(HORARIO, correrPrioridadDiaria, { timezone: ZONA_HORARIA, name: 'prioridad-diaria' });
}
