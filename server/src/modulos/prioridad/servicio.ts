import type { EstadoIncidente, Prisma } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { transaccion } from '../reportes/repositorio.js';
import { calcularPrioridad } from './calculo.js';
import * as repositorio from './repositorio.js';

const ESTADOS_CERRADOS: EstadoIncidente[] = ['RESUELTO', 'DESESTIMADO'];

/**
 * Recalcula la prioridad del incidente y reemplaza su desglose (F07), dentro de la transacción del cambio
 * que la disparó. Está suscripta a alCambiarIncidente (app.ts): corre al sumar un reporte, al revisarlo, al
 * unir o separar.
 *
 * Un incidente resuelto o desestimado no se recalcula: ya no está en la bandeja, y su desglose queda como
 * estaba al cerrarse (si no, diría que lleva días «sin resolverse»).
 */
export async function recalcularPrioridad(tx: Prisma.TransactionClient, incidenteId: number) {
  const incidente = await repositorio.leerIncidente(tx, incidenteId);
  if (!incidente || ESTADOS_CERRADOS.includes(incidente.estado)) return;

  const parametros = await repositorio.leerParametros(tx);
  const confirmaciones = await repositorio.contarConfirmaciones(tx, incidenteId);
  const puntosCercanos = await repositorio.puntosCercanos(tx, incidenteId, parametros.radioContextoM);

  const { prioridadManual, motivoPrioridadManual } = incidente;
  const resultado = calcularPrioridad(
    {
      severidad: incidente.severidad,
      categoria: {
        nombre: incidente.categoria.nombre,
        pesoSeveridadBase: Number(incidente.categoria.pesoSeveridadBase),
      },
      cantidadReportes: incidente.cantidadReportes,
      confirmaciones,
      primerReporteEn: incidente.primerReporteEn,
      puntosCercanos,
      // La base exige el motivo cuando hay prioridad manual.
      ajusteManual:
        prioridadManual === null
          ? null
          : {
              valor: Number(prioridadManual),
              motivo: motivoPrioridadManual ?? '',
              autor: incidente.ajustadaPor?.nombre ?? null,
            },
    },
    parametros,
    new Date(),
  );
  await repositorio.guardarPrioridad(tx, incidenteId, resultado);
}

export interface ResumenRecalculo {
  total: number;
  recalculados: number;
  /** Los que se cerraron, se unieron a otro o caducaron entre que se armó la lista y les tocó el turno. */
  salteados: number;
  fallidos: number;
  duracionMs: number;
}

/**
 * Recalcula varios incidentes, cada uno en su propia transacción: si uno falla, se deja el error en el log
 * y se sigue con los demás. Lo usa el recálculo diario (tareas/prioridadDiaria.ts).
 */
export async function recalcularIncidentes(ids: number[]): Promise<ResumenRecalculo> {
  const inicio = performance.now();
  let recalculados = 0;
  let fallidos = 0;
  for (const id of ids) {
    try {
      const recalculado = await transaccion(async (tx) => {
        // Sin el bloqueo, un reporte que se suma a la vez también reemplaza el desglose, y las dos
        // transacciones podrían dejar las filas de factor_prioridad duplicadas.
        const incidente = await repositorio.bloquearIncidente(tx, id);
        const sigueAbierto =
          incidente &&
          !incidente.unido &&
          !incidente.caducado &&
          !ESTADOS_CERRADOS.includes(incidente.estado);
        if (!sigueAbierto) return false;
        await recalcularPrioridad(tx, id);
        return true;
      });
      if (recalculado) recalculados++;
    } catch (error) {
      fallidos++;
      logger.error({ err: error, incidenteId: id }, `No se pudo recalcular la prioridad del incidente ${id}`);
    }
  }
  return {
    total: ids.length,
    recalculados,
    salteados: ids.length - recalculados - fallidos,
    fallidos,
    duracionMs: Math.round(performance.now() - inicio),
  };
}
