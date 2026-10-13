import { logger } from '../config/logger.js';
import { reintentarPendientes } from '../modulos/geocodificacion/servicio.js';

const CADA_MS = 10 * 60 * 1000;

async function vuelta() {
  try {
    const { pendientes, completados } = await reintentarPendientes();
    if (pendientes > 0) logger.info(`Direcciones pendientes: se completaron ${completados} de ${pendientes}`);
  } catch (error) {
    logger.error({ err: error }, 'Falló la tarea de direcciones pendientes');
  }
}

/** Al arrancar y cada 10 minutos, completa las direcciones que quedaron sin buscar. */
export function iniciarDireccionesPendientes() {
  void vuelta();
  return setInterval(vuelta, CADA_MS);
}
