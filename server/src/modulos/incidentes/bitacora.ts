import type { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { avisarCambioDeEstado } from '../avisos/disparar.js';

// La bitácora solo crece (regla 8 del molde): acá se agregan movimientos y se leen, nunca se cambian ni se borran.

/** Lo que se muestra de cada movimiento: qué pasó, quién lo hizo (null si fue el sistema) y cuándo. */
const DATOS_MOVIMIENTO = {
  id: true,
  tipo: true,
  usuario: { select: { id: true, nombre: true } },
  area: { select: { id: true, nombre: true } },
  estadoAnterior: true,
  estadoNuevo: true,
  comentario: true,
  incidenteRelacionadoId: true,
  creadoEn: true,
} satisfies Prisma.MovimientoIncidenteSelect;

/**
 * Agrega un movimiento y lo devuelve como se muestra en la ficha de gestión. Si es un cambio de estado, avisa a
 * quienes reportaron o siguen el incidente cuando se confirme la transacción (avisos/disparar.ts).
 */
export async function registrarMovimiento(
  tx: Prisma.TransactionClient,
  movimiento: Prisma.MovimientoIncidenteUncheckedCreateInput,
) {
  const creado = await tx.movimientoIncidente.create({ data: movimiento, select: DATOS_MOVIMIENTO });
  if (movimiento.estadoNuevo && movimiento.estadoNuevo !== movimiento.estadoAnterior) {
    avisarCambioDeEstado(
      movimiento.incidenteId,
      movimiento.estadoAnterior ?? null,
      movimiento.estadoNuevo,
      movimiento.usuarioId ?? null,
    );
  }
  return creado;
}

/** Los movimientos del incidente en el orden en que pasaron. */
export function leerBitacora(incidenteId: number) {
  return prisma.movimientoIncidente.findMany({
    where: { incidenteId },
    select: DATOS_MOVIMIENTO,
    orderBy: { id: 'asc' },
  });
}
