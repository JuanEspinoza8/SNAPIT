import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { INCIDENTE_VISIBLE, REPORTES_VISIBLES_DEL_INCIDENTE } from '../incidentes/repositorio.js';

export interface ReportePublico {
  id: number;
  incidenteId: number;
  descripcion: string | null;
  creadoEn: Date;
  /** Solo para numerar al autor dentro del incidente: nunca sale en la respuesta. */
  usuarioId: number;
  fotoIds: number[];
  cantidadMeGusta: bigint;
  cantidadComentarios: bigint;
}

// Lo que se muestra de cada reporte público. Va con el alias `r`.
const COLUMNAS_REPORTE = Prisma.sql`
  r.id,
  r.descripcion,
  r.creado_en AS "creadoEn",
  r.usuario_id AS "usuarioId",
  coalesce((SELECT array_agg(f.id ORDER BY f.id) FROM fotografia f WHERE f.reporte_id = r.id), '{}') AS "fotoIds",
  (SELECT count(*) FROM me_gusta_reporte m WHERE m.reporte_id = r.id) AS "cantidadMeGusta",
  (SELECT count(*) FROM comentario c WHERE c.reporte_id = r.id AND c.eliminado_en IS NULL) AS "cantidadComentarios"`;

/**
 * Los reportes que forman el incidente [principalId], cada uno con sus fotos y sus contadores. Son los mismos
 * cuyas fotos se ven en la ficha: no desestimados, no eliminados, sumando los de los incidentes unidos.
 */
export function listarReportes(principalId: number) {
  return prisma.$queryRaw<ReportePublico[]>`
    SELECT ${COLUMNAS_REPORTE}, ${principalId}::int AS "incidenteId"
    FROM reporte r
    WHERE r.id IN (SELECT r.id ${REPORTES_VISIBLES_DEL_INCIDENTE(principalId)})
    ORDER BY r.creado_en, r.id`;
}

/**
 * Un reporte que el público puede ver: no desestimado, no eliminado y de un incidente visible (o unido a uno
 * visible). `incidenteId` es el que ve el público, el principal si se unió a otro.
 */
export async function buscarReporte(id: number) {
  const [reporte] = await prisma.$queryRaw<ReportePublico[]>`
    SELECT ${COLUMNAS_REPORTE}, i.id AS "incidenteId"
    FROM reporte r
    JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
    JOIN incidente i ON i.id = coalesce(del_incidente.incidente_principal_id, del_incidente.id)
    WHERE r.id = ${id}
      AND r.estado_verificacion <> 'DESESTIMADO'
      AND r.eliminado_en IS NULL
      AND ${INCIDENTE_VISIBLE}`;
  return reporte;
}

/**
 * Los comentarios visibles de un reporte, o los del incidente [principalId] en general (también los que se
 * hicieron en un incidente que después se le unió), del más viejo al más nuevo.
 */
export function listarComentarios(de: { reporteId: number } | { principalId: number }) {
  const deQuien =
    'reporteId' in de
      ? { reporteId: de.reporteId }
      : { incidente: { OR: [{ id: de.principalId }, { incidentePrincipalId: de.principalId }] } };
  return prisma.comentario.findMany({
    where: { ...deQuien, eliminadoEn: null },
    select: { id: true, texto: true, creadoEn: true, editadoEn: true, usuarioId: true },
    orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
  });
}

/**
 * El número de cada vecino que participa en el incidente [principalId]: reportó una foto visible o dejó un
 * comentario visible en el incidente, en uno de sus unidos o en una de sus fotos. Se numera por orden de
 * llegada (su primera participación); si dos llegaron en el mismo instante, por id.
 */
export async function numerarParticipantes(principalId: number) {
  const visibles = REPORTES_VISIBLES_DEL_INCIDENTE(principalId);
  const filas = await prisma.$queryRaw<{ usuarioId: number; numero: bigint }[]>`
    WITH participaciones AS (
      SELECT r.usuario_id, r.creado_en ${visibles}
      UNION ALL
      SELECT c.usuario_id, c.creado_en
      FROM comentario c
      WHERE c.eliminado_en IS NULL
        AND (c.incidente_id IN (SELECT id FROM incidente WHERE id = ${principalId} OR incidente_principal_id = ${principalId})
             OR c.reporte_id IN (SELECT r.id ${visibles}))
    )
    SELECT usuario_id AS "usuarioId", row_number() OVER (ORDER BY min(creado_en), usuario_id) AS numero
    FROM participaciones
    GROUP BY usuario_id`;
  // row_number() llega como bigint: se pasa a número.
  return new Map(filas.map((fila) => [fila.usuarioId, Number(fila.numero)]));
}
