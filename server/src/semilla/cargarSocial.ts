import { Prisma, type PrismaClient } from '@prisma/client';
import { INCIDENTE_VISIBLE } from '../modulos/incidentes/repositorio.js';

/** Comentarios de ejemplo sobre una foto (un reporte). */
export const COMENTARIOS_REPORTE = [
  'Paso todos los días por acá y está cada vez peor.',
  'Ayer casi me caigo con la bici en ese lugar.',
  'Confirmo, lo vi esta mañana. Sigue igual.',
  'Buena foto, se ve clarito el problema.',
  'Con la lluvia de anoche se llenó de agua.',
  'Con el cochecito de mi hija no se puede pasar.',
  'Ojalá lo arreglen antes del invierno.',
  'Hay que tener cuidado de noche, no se ve nada.',
];

/** Comentarios de ejemplo sobre el incidente en general. */
export const COMENTARIOS_INCIDENTE = [
  '¿Alguien sabe si ya lo pasaron al área que corresponde?',
  'Llamé al municipio y me dijeron que está en la lista.',
  'Es el tercer invierno que pasa lo mismo en esta cuadra.',
  'Gracias a todos los que lo reportaron, así le dan prioridad.',
  'Hay una escuela a dos cuadras, es urgente.',
];

interface Reporte {
  id: number;
  incidenteId: number;
  usuarioId: number;
  creadoEn: Date;
}

/**
 * Likes y comentarios de ejemplo para ver el feed social en desarrollo. Los reparte entre los [usuarioIds] sobre
 * los reportes de los incidentes visibles (o solo de [incidenteIds], para los tests). Se puede correr las veces
 * que haga falta: los likes no se duplican, y un reporte o incidente que ya tiene comentarios no recibe más.
 * El reparto sale del id de cada reporte, así que dos corridas sobre la misma base dan lo mismo.
 */
export async function cargarSocial(
  prisma: PrismaClient,
  { usuarioIds, incidenteIds }: { usuarioIds: number[]; incidenteIds?: number[] },
) {
  if (usuarioIds.length === 0) throw new Error('No hay usuarios para repartir likes y comentarios');

  const soloEstos = incidenteIds ? Prisma.sql`AND i.id = ANY(${incidenteIds}::int[])` : Prisma.empty;
  // Los mismos reportes cuyas fotos se ven en el feed: no desestimados, no eliminados, de un incidente visible.
  const reportes = await prisma.$queryRaw<Reporte[]>`
    SELECT r.id, i.id AS "incidenteId", r.usuario_id AS "usuarioId", r.creado_en AS "creadoEn"
    FROM reporte r
    JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
    JOIN incidente i ON i.id = coalesce(del_incidente.incidente_principal_id, del_incidente.id)
    WHERE r.estado_verificacion <> 'DESESTIMADO' AND r.eliminado_en IS NULL AND ${INCIDENTE_VISIBLE} ${soloEstos}
    ORDER BY r.id`;

  // Cada reporte elige a los demás usuarios en un orden distinto, para que no sean siempre los mismos.
  const otros = (id: number, autorId: number) => {
    const candidatos = usuarioIds.filter((u) => u !== autorId);
    const corrimiento = id % Math.max(candidatos.length, 1);
    return [...candidatos.slice(corrimiento), ...candidatos.slice(0, corrimiento)];
  };
  // Unas horas después del reporte, sin pasarse de ahora.
  const despues = (desde: Date, horas: number) =>
    new Date(Math.min(desde.getTime() + horas * 3_600_000, Date.now()));

  const meGustas = reportes.flatMap((r) =>
    otros(r.id, r.usuarioId)
      // Entre 1 y todos los demás: así cada foto tiene una cantidad distinta.
      .slice(0, 1 + ((r.id * 5) % usuarioIds.length))
      .map((usuarioId, n) => ({ reporteId: r.id, usuarioId, creadoEn: despues(r.creadoEn, n + 1) })),
  );
  const { count: likes } = await prisma.meGustaReporte.createMany({ data: meGustas, skipDuplicates: true });

  const conComentarios = new Set(
    (
      await prisma.comentario.findMany({
        where: { reporteId: { in: reportes.map((r) => r.id) } },
        select: { reporteId: true },
      })
    ).map((c) => c.reporteId),
  );
  const comentariosReporte = reportes
    .filter((r) => !conComentarios.has(r.id))
    .flatMap((r) =>
      otros(r.id, r.usuarioId)
        .slice(0, r.id % 4)
        .map((usuarioId, n) => ({
          reporteId: r.id,
          usuarioId,
          texto: COMENTARIOS_REPORTE[(r.id * 3 + n * 5) % COMENTARIOS_REPORTE.length]!,
          creadoEn: despues(r.creadoEn, 2 * n + 2),
        })),
    );

  // Entre uno y tres comentarios generales por incidente, después de su primer reporte.
  const incidentes = new Map<number, Reporte>();
  for (const r of reportes) if (!incidentes.has(r.incidenteId)) incidentes.set(r.incidenteId, r);
  const incidentesConComentarios = new Set(
    (
      await prisma.comentario.findMany({
        where: { incidenteId: { in: [...incidentes.keys()] } },
        select: { incidenteId: true },
      })
    ).map((c) => c.incidenteId),
  );
  const comentariosIncidente = [...incidentes.values()]
    .filter((r) => !incidentesConComentarios.has(r.incidenteId))
    .flatMap((r) =>
      otros(r.incidenteId, -1)
        .slice(0, 1 + (r.incidenteId % 3))
        .map((usuarioId, n) => ({
          incidenteId: r.incidenteId,
          usuarioId,
          texto: COMENTARIOS_INCIDENTE[(r.incidenteId * 2 + n) % COMENTARIOS_INCIDENTE.length]!,
          creadoEn: despues(r.creadoEn, 3 * n + 5),
        })),
    );

  const { count: comentarios } = await prisma.comentario.createMany({
    data: [...comentariosReporte, ...comentariosIncidente],
  });

  return { reportes: reportes.length, incidentes: incidentes.size, likes, comentarios };
}
