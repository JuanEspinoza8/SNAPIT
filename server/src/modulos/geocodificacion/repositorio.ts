import { prisma } from '../../compartido/prisma.js';

/** Guarda la dirección en el reporte y, si todavía no tiene una, en su incidente. Las dos o ninguna. */
export function guardarDireccion(reporteId: number, direccion: string) {
  return prisma.$transaction(async (tx) => {
    const { incidenteId } = await tx.reporte.update({
      where: { id: reporteId },
      data: { direccion },
      select: { incidenteId: true },
    });
    // Si el incidente ya tenía dirección (la de otro reporte del mismo problema), se deja la que estaba.
    if (incidenteId !== null) {
      await tx.incidente.updateMany({ where: { id: incidenteId, direccion: null }, data: { direccion } });
    }
  });
}

export interface ReportePendiente {
  id: number;
  lat: number;
  lon: number;
}

/** Los reportes que siguen sin dirección, del más viejo al más nuevo. */
export function listarPendientes(limite: number) {
  // Los que llegaron hace menos de 2 minutos todavía tienen su primer intento en camino.
  return prisma.$queryRaw<ReportePendiente[]>`
    SELECT r.id, ST_Y(r.ubicacion::geometry) AS lat, ST_X(r.ubicacion::geometry) AS lon
    FROM reporte r
    WHERE r.direccion IS NULL
      AND r.creado_en < now() - interval '2 minutes'
    ORDER BY r.creado_en, r.id
    LIMIT ${limite}`;
}
