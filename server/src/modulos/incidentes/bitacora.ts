import type { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';

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

/** Agrega un movimiento y lo devuelve como se muestra en la ficha de gestión. */
export function registrarMovimiento(
  tx: Prisma.TransactionClient,
  movimiento: Prisma.MovimientoIncidenteUncheckedCreateInput,
) {
  return tx.movimientoIncidente.create({ data: movimiento, select: DATOS_MOVIMIENTO });
}

/** Los movimientos del incidente en el orden en que pasaron. */
export function leerBitacora(incidenteId: number) {
  return prisma.movimientoIncidente.findMany({
    where: { incidenteId },
    select: DATOS_MOVIMIENTO,
    orderBy: { id: 'asc' },
  });
}
