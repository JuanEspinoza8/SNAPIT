import type { EventoCola, ReportePendiente, Severidad } from './tipos.js';

export type Decision = 'VERIFICADO' | 'DESESTIMADO';

export type EstadoFila =
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'CLASIFICADO'
  | 'PUBLICADO_IA'
  | 'REVISION_MANUAL'
  | 'ERROR'
  | 'APROBADO'
  | 'DESESTIMADO'
  | 'RESUELTO';

export interface Fila {
  estado: EstadoFila;
  /** Ya no hay nada que decidir: se puede limpiar de la lista. */
  resuelta: boolean;
  /** Se puede abrir para revisarlo y decidir a mano. */
  revisable: boolean;
  /** Lo que propuso la IA, de este procesamiento o de uno anterior. */
  propuesta: { categoriaId: number | null; severidad: Severidad | null; explicacion: string | null } | null;
  /** El motivo del último paso de la IA (por qué la derivó o por qué falló). */
  detalle: string | null;
  incidenteId: number | null;
}

interface Contexto {
  /** Si sigue pendiente en el servidor. */
  pendiente: boolean;
  /** Los pasos de la IA con este reporte en el procesamiento lanzado desde esta pantalla, en orden. */
  eventos: EventoCola[];
  /** La decisión que se tomó a mano desde esta pantalla, si hubo. */
  decision: Decision | undefined;
  /** Si el procesamiento sigue en curso. */
  enCurso: boolean;
}

/**
 * En qué está un reporte de la cola, juntando lo que se sabe: la decisión manual tomada acá, lo que hizo la IA
 * en el procesamiento lanzado desde esta pantalla y si el servidor todavía lo tiene pendiente.
 */
export function estadoDeFila(reporte: ReportePendiente, contexto: Contexto): Fila {
  const ultimo = contexto.eventos.at(-1);
  const clasificado = [...contexto.eventos].reverse().find((evento) => evento.estado === 'CLASIFICADO');
  const propuesta = clasificado?.propuesta
    ? {
        categoriaId: clasificado.propuesta.categoriaId,
        severidad: clasificado.propuesta.severidad,
        explicacion: clasificado.propuesta.explicacion,
      }
    : reporte.propuestaIa;
  const incidenteId = ultimo?.reporte.incidenteId ?? reporte.incidente?.id ?? null;
  const base = { propuesta, detalle: ultimo?.detalle ?? null, incidenteId };

  if (contexto.decision) {
    const estado = contexto.decision === 'VERIFICADO' ? 'APROBADO' : 'DESESTIMADO';
    return { ...base, estado, resuelta: true, revisable: false };
  }
  if (ultimo?.estado === 'PUBLICADO')
    return { ...base, estado: 'PUBLICADO_IA', resuelta: true, revisable: false };
  if (!contexto.pendiente) return { ...base, estado: 'RESUELTO', resuelta: true, revisable: false };
  if (ultimo && (ultimo.estado === 'EN_PROCESO' || ultimo.estado === 'CLASIFICADO') && contexto.enCurso) {
    return { ...base, estado: ultimo.estado, resuelta: false, revisable: false };
  }
  if (ultimo?.estado === 'REVISION_MANUAL' || ultimo?.estado === 'ERROR') {
    return { ...base, estado: ultimo.estado, resuelta: false, revisable: true };
  }
  return { ...base, estado: 'PENDIENTE', resuelta: false, revisable: true };
}
