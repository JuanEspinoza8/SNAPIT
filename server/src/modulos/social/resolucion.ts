import type { Prisma } from '@prisma/client';
import { idUsuarioSistema } from '../../compartido/usuarioSistema.js';
import { logger } from '../../config/logger.js';

/**
 * Cuando un incidente se resuelve, SnapIt lo cuenta en cada publicación del problema (los reportes publicados del
 * incidente y de sus unidos): así cada vecino ve que su reporte sirvió. Va dentro de la transacción del cierre.
 * Sin el usuario de SnapIt (la semilla lo crea), el incidente se resuelve igual, sin el comentario.
 */
export async function contarResolucion(tx: Prisma.TransactionClient, incidenteId: number) {
  const sistemaId = await idUsuarioSistema(tx);
  if (sistemaId === null) {
    logger.warn({ incidenteId }, 'No existe el usuario de SnapIt: se resuelve sin comentar en los reportes');
    return;
  }
  const [{ area } = { area: null }] = await tx.$queryRaw<{ area: string | null }[]>`
    SELECT a.nombre AS area
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    LEFT JOIN area a ON a.id = coalesce(i.area_id, c.area_id)
    WHERE i.id = ${incidenteId}`;
  const publicados = await tx.reporte.findMany({
    where: {
      estadoVerificacion: 'VERIFICADO',
      eliminadoEn: null,
      incidente: { OR: [{ id: incidenteId }, { incidentePrincipalId: incidenteId }] },
    },
    select: { id: true },
  });
  const texto = area
    ? `¡Listo! El área de ${area} resolvió este problema. Gracias por reportarlo.`
    : '¡Listo! Este problema ya se resolvió. Gracias por reportarlo.';
  await tx.comentario.createMany({
    data: publicados.map(({ id }) => ({ reporteId: id, usuarioId: sistemaId, texto })),
  });
}
