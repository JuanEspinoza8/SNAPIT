import cron from 'node-cron';
import { logger } from '../config/logger.js';
import { caducarIncidentes } from '../modulos/incidentes/caducidad.js';
import { listarVencidos } from '../modulos/incidentes/repositorio.js';
import { HORARIO, ZONA_HORARIA } from './prioridadDiaria.js';

/**
 * Marca como caducados los temporales vencidos (F12). El mapa, la bandeja y los recorridos ya los dejan afuera
 * desde que vencen (INCIDENTE_VISIBLE): la marca queda en la bitácora y en «Mis reportes». Devuelve el resumen,
 * o null si ni siquiera se pudo pedir la lista.
 */
export async function correrCaducidadDiaria() {
  try {
    const resumen = await caducarIncidentes(await listarVencidos());
    const { total, caducados, salteados, fallidos, duracionMs } = resumen;
    const aclaraciones = [
      salteados > 0 && `${salteados} ya no ${salteados === 1 ? 'correspondía' : 'correspondían'}`,
      fallidos > 0 && `${fallidos} ${fallidos === 1 ? 'falló' : 'fallaron'}`,
    ].filter(Boolean);
    const detalle = aclaraciones.length > 0 ? ` (${aclaraciones.join(', ')})` : '';
    logger.info(
      resumen,
      `Caducidad diaria: caducaron ${caducados} de ${total} incidentes vencidos en ${duracionMs} ms${detalle}`,
    );
    return resumen;
  } catch (error) {
    logger.error({ err: error }, 'Falló la caducidad diaria');
    return null;
  }
}

/**
 * Corre al arrancar, por si el servidor estaba apagado a las 03:00, y después todos los días a la misma hora que
 * el recálculo de prioridad. No se pisan: ese recálculo ya deja afuera a los vencidos.
 */
export function iniciarCaducidadDiaria() {
  void correrCaducidadDiaria();
  return cron.schedule(HORARIO, correrCaducidadDiaria, { timezone: ZONA_HORARIA, name: 'caducidad-diaria' });
}
