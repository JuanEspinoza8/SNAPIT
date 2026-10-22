import type { EstadoEvento, EventoCola } from './tipos.js';

/** Un reporte del procesamiento con todos sus pasos, del primero al último. */
export interface ReporteProcesado {
  reporte: EventoCola['reporte'];
  eventos: EventoCola[];
  /** El último paso: en qué está o en qué terminó. */
  estado: EstadoEvento;
  /** Lo que propuso la IA, si llegó a clasificarlo. */
  propuesta: EventoCola['propuesta'];
  ultimoEvento: string;
}

/**
 * Junta los eventos del log por reporte, en el orden en que la IA los fue tomando. Los eventos llegan
 * ordenados (GET /api/ia/procesos/:id), así que el último de cada reporte es su estado actual.
 */
export function agruparPorReporte(eventos: EventoCola[]): ReporteProcesado[] {
  const porReporte = new Map<number, ReporteProcesado>();
  for (const evento of eventos) {
    const fila = porReporte.get(evento.reporte.id);
    if (!fila) {
      porReporte.set(evento.reporte.id, {
        reporte: evento.reporte,
        eventos: [evento],
        estado: evento.estado,
        propuesta: evento.propuesta,
        ultimoEvento: evento.creadoEn,
      });
      continue;
    }
    fila.eventos.push(evento);
    fila.estado = evento.estado;
    fila.ultimoEvento = evento.creadoEn;
    fila.propuesta = evento.propuesta ?? fila.propuesta;
    // El incidente puede cambiar entre pasos (por ejemplo, si se unió a otro): vale el más reciente.
    fila.reporte = evento.reporte;
  }
  return [...porReporte.values()];
}
