import type { EstadoIncidente, Prisma } from '@prisma/client';
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
