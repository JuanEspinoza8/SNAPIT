import type { EstadoIncidente, Prisma } from '@prisma/client';
import { severidadConsolidada } from '../agrupacion/calculo.js';
import { severidadesDeclaradas } from '../agrupacion/repositorio.js';
import * as repositorio from './repositorio.js';

export interface ResultadoVerificacion {
  reporteId: number;
  decision: 'VERIFICADO' | 'DESESTIMADO';
  /** El operador que lo revisó, o null si lo verificó el sistema al recibirlo. */
  operadorId: number | null;
  comentario: string | null;
}

export interface EfectoDelResultado {
  reputacion: number;
  /** El incidente que manda, con su estado después del resultado. Null si el reporte quedó sin incidente. */
  incidente: { id: number; estado: EstadoIncidente } | null;
}

/**
 * Lo que pasa cuando un reporte queda verificado o desestimado (F04), igual si lo decidió el sistema al
 * recibirlo o un operador al revisarlo. Va dentro de la transacción de quien lo llama, y con el estado del
 * reporte ya guardado:
 * - Suma el reporte al historial del vecino y recalcula su reputación.
 * - El incidente pasa de REGISTRADO a VERIFICADO con su primer reporte verificado, y a DESESTIMADO si ya no le
 *   queda ningún reporte sin desestimar. Si sigue vivo después de un desestimado, se recalcula su severidad.
 * - Deja el movimiento en la bitácora del incidente.
 *
 * No avisa al módulo de prioridad: lo hace quien llama, una vez que terminó con el incidente.
 */
export async function aplicarResultado(
  tx: Prisma.TransactionClient,
  resultado: ResultadoVerificacion,
): Promise<EfectoDelResultado> {
  const reporte = await repositorio.leerReporte(tx, resultado.reporteId);
  const reputacion = await repositorio.sumarAlHistorial(tx, reporte.usuarioId, resultado.decision);
  if (reporte.incidenteId === null) return { reputacion, incidente: null };

  const id = reporte.incidenteId;
  const anterior = await repositorio.bloquearIncidente(tx, id);
  let nuevo = anterior;
  if (anterior === 'REGISTRADO') {
    if (resultado.decision === 'VERIFICADO') nuevo = 'VERIFICADO';
    else if ((await repositorio.contarReportesValidos(tx, id)) === 0) nuevo = 'DESESTIMADO';
  }

  // Un desestimado deja de contar para la severidad consolidada (#53). Si no quedó ninguno, se conserva.
  const declaradas = resultado.decision === 'DESESTIMADO' ? await severidadesDeclaradas(tx, id) : [];
  const severidad = declaradas.length > 0 ? severidadConsolidada(declaradas) : undefined;
  if (nuevo !== anterior || severidad) {
    await repositorio.actualizarIncidente(tx, id, {
      ...(nuevo !== anterior && { estado: nuevo }),
      ...(severidad && { severidad }),
    });
  }

  const comentario = describir(resultado, reporte.nivelConfianza);
  if (nuevo !== anterior) {
    await repositorio.registrarMovimiento(tx, {
      incidenteId: id,
      usuarioId: resultado.operadorId,
      tipo: 'CAMBIO_ESTADO',
      estadoAnterior: anterior,
      estadoNuevo: nuevo,
      comentario,
    });
  } else if (resultado.operadorId !== null) {
    // Una revisión queda siempre en la bitácora, aunque el incidente no cambie de estado.
    await repositorio.registrarMovimiento(tx, {
      incidenteId: id,
      usuarioId: resultado.operadorId,
      tipo: 'COMENTARIO',
      comentario,
    });
  }

  return { reputacion, incidente: { id, estado: nuevo } };
}

/** El texto del movimiento: qué reporte, quién lo decidió y, si hay, el comentario del operador. */
function describir(resultado: ResultadoVerificacion, nivelConfianza: number) {
  const que = resultado.decision === 'VERIFICADO' ? 'verificado' : 'desestimado';
  if (resultado.operadorId === null) {
    return `Reporte #${resultado.reporteId} ${que} automáticamente (confianza ${nivelConfianza})`;
  }
  const base = `Reporte #${resultado.reporteId} ${que} por el operador`;
  return resultado.comentario ? `${base}: ${resultado.comentario}` : base;
}
