import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { INCIDENTE_VISIBLE, REPORTES_DEL_INCIDENTE } from '../incidentes/repositorio.js';

export interface ReportePublico {
  id: number;
  incidenteId: number;
  descripcion: string | null;
  creadoEn: Date;
  autorId: number;
  autorNombre: string;
  fotoIds: number[];
  cantidadMeGusta: bigint;
  cantidadComentarios: bigint;
}

// Lo que se muestra de cada reporte público. Va con los alias `r` (reporte) y `u` (su autor).
const COLUMNAS_REPORTE = Prisma.sql`
  r.id,
  r.descripcion,
  r.creado_en AS "creadoEn",
  u.id AS "autorId",
  u.nombre AS "autorNombre",
  coalesce((SELECT array_agg(f.id ORDER BY f.id) FROM fotografia f WHERE f.reporte_id = r.id), '{}') AS "fotoIds",
  (SELECT count(*) FROM me_gusta_reporte m WHERE m.reporte_id = r.id) AS "cantidadMeGusta",
  (SELECT count(*) FROM comentario c WHERE c.reporte_id = r.id AND c.eliminado_en IS NULL) AS "cantidadComentarios"`;

/**
 * Los reportes que forman el incidente [principalId], cada uno con su autor, sus fotos y sus contadores. Son los
 * mismos cuyas fotos se ven en la ficha: no desestimados, no eliminados, sumando los de los incidentes unidos.
 */
export function listarReportes(principalId: number) {
  return prisma.$queryRaw<ReportePublico[]>`
    SELECT ${COLUMNAS_REPORTE}, ${principalId}::int AS "incidenteId"
    FROM reporte r
    JOIN usuario u ON u.id = r.usuario_id
    WHERE r.id IN (SELECT r.id ${REPORTES_DEL_INCIDENTE(principalId)})
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
    JOIN usuario u ON u.id = r.usuario_id
    JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
    JOIN incidente i ON i.id = coalesce(del_incidente.incidente_principal_id, del_incidente.id)
    WHERE r.id = ${id}
      AND r.estado_verificacion <> 'DESESTIMADO'
      AND r.eliminado_en IS NULL
      AND ${INCIDENTE_VISIBLE}`;
  return reporte;
}

/** Los comentarios visibles de un reporte o de un incidente, del más viejo al más nuevo, con su autor. */
export function listarComentarios(de: { reporteId: number } | { incidenteId: number }) {
  return prisma.comentario.findMany({
    where: { ...de, eliminadoEn: null },
    select: {
      id: true,
      texto: true,
      creadoEn: true,
      editadoEn: true,
      usuario: { select: { id: true, nombre: true } },
    },
    orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
  });
}
