import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import type { PedidoFeed } from '../incidentes/esquemas.js';
import {
  condicionesDe,
  DERIVADO_A,
  INCIDENTE_VISIBLE,
  MARCADO_PARA_DESESTIMAR,
  REPORTES_VISIBLES_DEL_INCIDENTE,
} from '../incidentes/repositorio.js';

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
  /** Si quien consulta ya le dio me gusta. Sin sesión, false. */
  yaMeGusta: boolean;
}

// Lo que se muestra de cada reporte público, para quien consulta (`usuarioId`, null sin sesión). Va con el
// alias `r`.
const COLUMNAS_REPORTE = (usuarioId: number | null) => Prisma.sql`
  r.id,
  r.descripcion,
  r.creado_en AS "creadoEn",
  r.usuario_id AS "usuarioId",
  coalesce((SELECT array_agg(f.id ORDER BY f.id) FROM fotografia f WHERE f.reporte_id = r.id), '{}') AS "fotoIds",
  (SELECT count(*) FROM me_gusta_reporte m WHERE m.reporte_id = r.id) AS "cantidadMeGusta",
  (SELECT count(*) FROM comentario c WHERE c.reporte_id = r.id AND c.eliminado_en IS NULL) AS "cantidadComentarios",
  EXISTS (SELECT 1 FROM me_gusta_reporte m WHERE m.reporte_id = r.id AND m.usuario_id = ${usuarioId}::int)
    AS "yaMeGusta"`;

/**
 * Los reportes que forman el incidente [principalId], cada uno con sus fotos y sus contadores. Son los mismos
 * cuyas fotos se ven en la ficha: no desestimados, no eliminados, sumando los de los incidentes unidos.
 */
export function listarReportes(principalId: number, usuarioId: number | null) {
  return prisma.$queryRaw<ReportePublico[]>`
    SELECT ${COLUMNAS_REPORTE(usuarioId)}, ${principalId}::int AS "incidenteId"
    FROM reporte r
    WHERE r.id IN (SELECT r.id ${REPORTES_VISIBLES_DEL_INCIDENTE(principalId)})
    ORDER BY r.creado_en, r.id`;
}

/**
 * Un reporte que el público puede ver: no desestimado, no eliminado, no marcado para desestimar y de un incidente
 * visible (o unido a uno visible). `incidenteId` es el que ve el público, el principal si se unió a otro.
 */
export async function buscarReporte(id: number, usuarioId: number | null = null) {
  const [reporte] = await prisma.$queryRaw<ReportePublico[]>`
    SELECT ${COLUMNAS_REPORTE(usuarioId)}, i.id AS "incidenteId"
    FROM reporte r
    JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
    JOIN incidente i ON i.id = coalesce(del_incidente.incidente_principal_id, del_incidente.id)
    WHERE r.id = ${id}
      AND r.estado_verificacion <> 'DESESTIMADO'
      AND r.eliminado_en IS NULL
      AND NOT ${MARCADO_PARA_DESESTIMAR()}
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
 * llegada (su primera participación); si dos llegaron en el mismo instante, por id. SnapIt (`sistemaId`) comenta
 * pero no es un vecino: no se numera.
 */
export async function numerarParticipantes(principalId: number, sistemaId: number | null) {
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
    WHERE usuario_id IS DISTINCT FROM ${sistemaId}::int
    GROUP BY usuario_id`;
  // row_number() llega como bigint: se pasa a número.
  return new Map(filas.map((fila) => [fila.usuarioId, Number(fila.numero)]));
}

/** Da me gusta: si ya lo había dado, no pasa nada (la clave única no deja duplicarlo). */
export function darMeGusta(reporteId: number, usuarioId: number) {
  return prisma.meGustaReporte.createMany({ data: [{ reporteId, usuarioId }], skipDuplicates: true });
}

/** Quita el me gusta: si no lo había dado, no pasa nada. */
export function quitarMeGusta(reporteId: number, usuarioId: number) {
  return prisma.meGustaReporte.deleteMany({ where: { reporteId, usuarioId } });
}

export function contarMeGusta(reporteId: number) {
  return prisma.meGustaReporte.count({ where: { reporteId } });
}

const COLUMNAS_COMENTARIO = {
  id: true,
  texto: true,
  creadoEn: true,
  editadoEn: true,
  usuarioId: true,
} as const;

export function comentarReporte(reporteId: number, usuarioId: number, texto: string) {
  return prisma.comentario.create({ data: { reporteId, usuarioId, texto }, select: COLUMNAS_COMENTARIO });
}

export function comentarIncidente(incidenteId: number, usuarioId: number, texto: string) {
  return prisma.comentario.create({ data: { incidenteId, usuarioId, texto }, select: COLUMNAS_COMENTARIO });
}

/** Un comentario no eliminado, con lo que hace falta para saber si se ve y quién lo puede tocar. */
export function buscarComentario(id: number) {
  return prisma.comentario.findFirst({
    where: { id, eliminadoEn: null },
    select: { ...COLUMNAS_COMENTARIO, reporteId: true, incidenteId: true },
  });
}

export function editarComentario(id: number, texto: string) {
  return prisma.comentario.update({
    where: { id },
    data: { texto, editadoEn: new Date() },
    select: COLUMNAS_COMENTARIO,
  });
}

export function eliminarComentario(id: number) {
  return prisma.comentario.update({ where: { id }, data: { eliminadoEn: new Date() } });
}

export interface PublicacionFeed extends ReportePublico {
  cursorMicrosegundos: bigint;
  categoriaId: number;
  categoriaNombre: string;
  severidad: string;
  direccion: string | null;
  lat: number;
  lon: number;
  derivadoA: { id: number; nombre: string } | null;
  incidenteEstado: string;
  resueltoEn: Date | null;
  cantidadVecinos: bigint;
}

/**
 * El feed de publicaciones: los reportes publicados (VERIFICADO, sin eliminar) de los incidentes que se ven, del
 * más nuevo al más viejo, con los mismos filtros que el mapa (sobre su incidente). La categoría es la del
 * incidente, que un operador puede haber corregido. Trae una fila de más para saber si hay otra página.
 */
export function listarFeed(pedido: PedidoFeed, usuarioId: number | null) {
  const condiciones = condicionesDe(pedido);
  condiciones.push(Prisma.sql`r.estado_verificacion = 'VERIFICADO'`, Prisma.sql`r.eliminado_en IS NULL`);
  if (pedido.cursor) {
    condiciones.push(
      Prisma.sql`(r.creado_en, r.id) <
        (to_timestamp(0) + ${pedido.cursor.microsegundos}::bigint * interval '1 microsecond', ${pedido.cursor.id}::int)`,
    );
  }
  return prisma.$queryRaw<PublicacionFeed[]>`
    SELECT ${COLUMNAS_REPORTE(usuarioId)},
           i.id AS "incidenteId",
           (extract(epoch FROM r.creado_en) * 1000000)::bigint AS "cursorMicrosegundos",
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           r.severidad_declarada::text AS severidad,
           coalesce(r.direccion, i.direccion) AS direccion,
           ST_Y(r.ubicacion::geometry) AS lat,
           ST_X(r.ubicacion::geometry) AS lon,
           ${DERIVADO_A} AS "derivadoA",
           i.estado::text AS "incidenteEstado",
           i.resuelto_en AS "resueltoEn",
           (SELECT count(DISTINCT r.usuario_id) ${REPORTES_VISIBLES_DEL_INCIDENTE(Prisma.sql`i.id`)}) AS "cantidadVecinos"
    FROM reporte r
    JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
    JOIN incidente i ON i.id = coalesce(del_incidente.incidente_principal_id, del_incidente.id)
    JOIN categoria c ON c.id = i.categoria_id
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY r.creado_en DESC, r.id DESC
    LIMIT ${pedido.limite + 1}`;
}
