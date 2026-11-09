import type { EstadoIncidente } from '@prisma/client';
import { despuesDeConfirmar } from '../../compartido/despuesDeConfirmar.js';
import { logger } from '../../config/logger.js';
import {
  destinatariosDelCambio,
  queYDonde,
  textoCambioEstado,
  textoNuevoEnZona,
  textoVerificacion,
} from './calculo.js';
import * as repositorio from './repositorio.js';
import { notificar } from './servicio.js';

/*
 * Cuándo se avisa cada cosa (F09 y F10). Cada función se llama donde pasa el hecho, dentro de su transacción, y
 * el aviso sale recién cuando se confirma (despuesDeConfirmar): nunca un aviso de algo que después se deshizo.
 * notificar() respeta los avisos apagados y las preferencias por categoría de cada uno.
 */

/** Un aviso por destinatario. Si falla con uno, queda en el log y se sigue: los demás reciben el suyo igual. */
async function avisarA<T extends { usuarioId: number }>(
  destinatarios: T[],
  incidenteId: number,
  enviar: (destinatario: T) => Promise<unknown>,
) {
  for (const destinatario of destinatarios) {
    try {
      await enviar(destinatario);
    } catch (error) {
      logger.error(
        { err: error, usuarioId: destinatario.usuarioId, incidenteId },
        'No se pudo avisar a un vecino',
      );
    }
  }
}

/**
 * El incidente cambió de estado: avisa a quienes lo reportaron o lo siguen, también en los unidos. Si quedó
 * RESUELTO, quienes lo reportaron reciben el aviso de cierre. Quien hizo el cambio no se avisa, ni quienes ya
 * recibieron otro aviso por el mismo hecho (`yaAvisados`).
 */
export function avisarCambioDeEstado(
  incidenteId: number,
  anterior: EstadoIncidente | null,
  nuevo: EstadoIncidente,
  actorId: number | null,
  yaAvisados: number[] = [],
) {
  if (anterior === nuevo) return;
  despuesDeConfirmar(async () => {
    const incidente = await repositorio.buscarIncidente(incidenteId);
    if (!incidente) return;
    const [reportaron, siguen] = await Promise.all([
      repositorio.quienesReportaron(incidenteId),
      repositorio.quienesSiguen(incidenteId),
    ]);
    const problema = queYDonde(incidente.categoria, incidente.direccion);
    const destinatarios = destinatariosDelCambio({ reportaron, siguen, actorId, nuevo, yaAvisados });
    await avisarA(destinatarios, incidenteId, ({ usuarioId, tipo }) => {
      const { titulo, cuerpo } = textoCambioEstado(tipo, problema, nuevo);
      return notificar(usuarioId, tipo, incidenteId, titulo, cuerpo);
    });
  });
}

/**
 * Un operador (o la IA, desde la cola) verificó o desestimó el reporte: le avisa a su autor. La verificación
 * automática al crearlo no se avisa: la pantalla de reportar ya se lo dice en ese momento.
 */
export function avisarVerificacion(
  reporteId: number,
  incidenteId: number | null,
  decision: 'VERIFICADO' | 'DESESTIMADO',
  actorId: number,
) {
  despuesDeConfirmar(async () => {
    const reporte = await repositorio.buscarReporte(reporteId);
    if (!reporte || reporte.usuarioId === actorId) return;
    const { titulo, cuerpo } = textoVerificacion(decision, reporte.categoria);
    await notificar(reporte.usuarioId, 'VERIFICACION', incidenteId, titulo, cuerpo);
  });
}

/** El reporte recién creado quedó pendiente de revisión: «Tu reporte está en verificación». */
export function avisarReporteEnVerificacion(reporteId: number, incidenteId: number) {
  despuesDeConfirmar(async () => {
    const reporte = await repositorio.buscarReporte(reporteId);
    if (!reporte) return;
    const { titulo, cuerpo } = textoVerificacion('PENDIENTE', reporte.categoria);
    await notificar(reporte.usuarioId, 'VERIFICACION', incidenteId, titulo, cuerpo);
  });
}

/**
 * Apareció un incidente nuevo: avisa a los vecinos con una zona habitual activa que lo contiene, salvo a quien lo
 * reportó.
 */
export function avisarNuevoEnZona(incidenteId: number, autorId: number) {
  despuesDeConfirmar(async () => {
    const incidente = await repositorio.buscarIncidente(incidenteId);
    if (!incidente) return;
    const problema = queYDonde(incidente.categoria, incidente.direccion);
    const zonas = await repositorio.zonasQueContienen(incidenteId, autorId);
    await avisarA(zonas, incidenteId, ({ usuarioId, zona }) => {
      const { titulo, cuerpo } = textoNuevoEnZona(zona, problema);
      return notificar(usuarioId, 'NUEVO_EN_ZONA', incidenteId, titulo, cuerpo);
    });
  });
}
