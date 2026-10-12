import { logger } from '../../config/logger.js';
import { armarDireccion } from './calculo.js';
import { nominatim } from './nominatim.js';
import * as repositorio from './repositorio.js';
import type { ReportePendiente } from './repositorio.js';

/** Pide a Nominatim la dirección del punto y la guarda en el reporte (y en su incidente, si no tiene). */
export async function completarDireccion(reporte: ReportePendiente) {
  const direccion = armarDireccion(await nominatim.direccionDe(reporte.lat, reporte.lon));
  await repositorio.guardarDireccion(reporte.id, direccion);
}

/** No demora a quien la llama. Si falla, el reporte queda sin dirección y la tarea de pendientes lo reintenta. */
export function completarDireccionSinEsperar(reporte: ReportePendiente) {
  completarDireccion(reporte).catch((error: unknown) => {
    logger.warn(
      { err: error, reporteId: reporte.id },
      'No se pudo completar la dirección; se reintenta más tarde',
    );
  });
}

// A una consulta por segundo, una vuelta dura menos de un minuto.
const PENDIENTES_POR_VUELTA = 50;

/**
 * Completa los reportes que quedaron sin dirección (Nominatim falló o el servidor se reinició).
 * Corta en la primera falla: si el servicio está caído, no tiene sentido insistirle.
 */
export async function reintentarPendientes() {
  const pendientes = await repositorio.listarPendientes(PENDIENTES_POR_VUELTA);
  let completados = 0;
  for (const reporte of pendientes) {
    try {
      await completarDireccion(reporte);
      completados++;
    } catch (error) {
      logger.warn(
        { err: error, reporteId: reporte.id },
        'No se pudo completar la dirección; se corta la vuelta',
      );
      break;
    }
  }
  return { pendientes: pendientes.length, completados };
}
