import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { SIN_BARRIO } from '../geocodificacion/calculo.js';
import type { Filtros, PedidoFeed } from './esquemas.js';

/**
 * Lo que se ve en el mapa público: ni desestimados, ni caducados, ni los unidos a otro incidente.
 * Un temporal cuya vigencia ya pasó cuenta como caducado aunque todavía no se haya marcado.
 * Va con el alias `i`. La usan también las fotos públicas (reportes/repositorio.ts).
 */
export const INCIDENTE_VISIBLE = Prisma.sql`
  i.estado <> 'DESESTIMADO'
  AND i.caducado_en IS NULL
  AND i.incidente_principal_id IS NULL
  AND (i.vigente_hasta IS NULL OR i.vigente_hasta > now())`;

/**
 * El barrio del incidente, con la misma regla que extraerBarrio() (geocodificacion/calculo.ts): lo que
 * está después de la última coma de la dirección, o la dirección entera si no tiene coma. Null mientras
 * la dirección no se completó. Va con el alias `i`.
 */
const BARRIO = Prisma.sql`
  CASE WHEN i.direccion IS NOT NULL
       THEN coalesce(nullif(btrim(substring(i.direccion from '[^,]*$')), ''), ${SIN_BARRIO})
  END`;

export interface PuntoMapa {
  id: number;
  lat: number;
  lon: number;
  categoriaId: number;
  categoriaNombre: string;
  estado: string;
  enRevision: boolean;
  primerReporteEn: Date;
  cantidadReportes: number;
}

// Lo que pueden filtrar el mapa y el feed, siempre sobre lo visible.
function condicionesDe(filtros: Filtros) {
  const condiciones = [INCIDENTE_VISIBLE];
  if (filtros.categoriaId) condiciones.push(Prisma.sql`i.categoria_id = ${filtros.categoriaId}`);
  if (filtros.estado) condiciones.push(Prisma.sql`i.estado = ${filtros.estado}::estado_incidente`);
  if (filtros.desde) condiciones.push(Prisma.sql`i.primer_reporte_en >= ${filtros.desde}`);
  if (filtros.hasta) condiciones.push(Prisma.sql`i.primer_reporte_en <= ${filtros.hasta}`);
  if (filtros.barrio) condiciones.push(Prisma.sql`${BARRIO} = ${filtros.barrio}`);
  if (filtros.bbox) {
    const { oeste, sur, este, norte } = filtros.bbox;
    const rectangulo = Prisma.sql`ST_MakeEnvelope(${oeste}, ${sur}, ${este}, ${norte}, 4326)`;
    // Sobre geography, && compara cajas en 3D: usa el índice GIST pero deja pasar puntos de afuera.
    // ST_Intersects sobre geometry descarta esos puntos contra el mismo rectángulo que muestra el mapa.
    condiciones.push(
      Prisma.sql`i.ubicacion && ${rectangulo}::geography AND ST_Intersects(i.ubicacion::geometry, ${rectangulo})`,
    );
  }
  return condiciones;
}

export function listarVisibles(filtros: Filtros) {
  const condiciones = condicionesDe(filtros);
  return prisma.$queryRaw<PuntoMapa[]>`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.primer_reporte_en AS "primerReporteEn",
           i.cantidad_reportes AS "cantidadReportes"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY i.primer_reporte_en DESC, i.id DESC`;
}

/** Cuántas fotos trae cada tarjeta del feed: alcanzan para el carrusel, el resto se ve en la ficha. */
export const FOTOS_POR_TARJETA = 5;

export interface TarjetaFeed extends PuntoMapa {
  severidad: string;
  direccion: string | null;
  resueltoEn: Date | null;
  cursorFecha: string;
  cantidadVecinos: bigint;
  fotoIds: number[];
  cantidadFotos: bigint;
  cantidadMeGusta: bigint;
  cantidadComentarios: bigint;
}

/**
 * Una página del feed, del más nuevo al más viejo, con el mismo orden que el mapa. Pagina por cursor
 * (fecha del primer reporte e id) y no por desplazamiento: si entra un incidente nuevo mientras alguien
 * scrollea, la página siguiente no repite el último. Trae uno de más para saber si hay otra página.
 */
export function listarFeed(pedido: PedidoFeed) {
  const condiciones = condicionesDe(pedido);
  if (pedido.cursor) {
    condiciones.push(
      Prisma.sql`(i.primer_reporte_en, i.id) < (${pedido.cursor.fecha}::timestamptz, ${pedido.cursor.id})`,
    );
  }
  const reportes = REPORTES_DEL_INCIDENTE(Prisma.sql`i.id`);

  return prisma.$queryRaw<TarjetaFeed[]>`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.severidad::text AS severidad,
           i.primer_reporte_en AS "primerReporteEn",
           i.primer_reporte_en::text AS "cursorFecha",
           i.cantidad_reportes AS "cantidadReportes",
           i.direccion,
           i.resuelto_en AS "resueltoEn",
           vecinos.cantidad AS "cantidadVecinos",
           coalesce(fotos.ids, '{}') AS "fotoIds",
           fotos.total AS "cantidadFotos",
           likes.total AS "cantidadMeGusta",
           comentarios.total AS "cantidadComentarios"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    CROSS JOIN LATERAL (SELECT count(DISTINCT r.usuario_id) AS cantidad ${reportes}) vecinos
    CROSS JOIN LATERAL (
      SELECT (array_agg(f.id ORDER BY f.id))[1:${FOTOS_POR_TARJETA}] AS ids, count(*) AS total
      FROM fotografia f
      JOIN (SELECT r.id ${reportes}) validos ON validos.id = f.reporte_id
    ) fotos
    -- Lo social suma todos sus reportes: el de cada foto se ve en el detalle.
    CROSS JOIN LATERAL (
      SELECT count(*) AS total
      FROM me_gusta_reporte m
      JOIN (SELECT r.id ${reportes}) validos ON validos.id = m.reporte_id
    ) likes
    CROSS JOIN LATERAL (
      SELECT count(*) AS total
      FROM comentario c
      LEFT JOIN (SELECT r.id ${reportes}) validos ON validos.id = c.reporte_id
      WHERE c.eliminado_en IS NULL AND (validos.id IS NOT NULL OR c.incidente_id = i.id)
    ) comentarios
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY i.primer_reporte_en DESC, i.id DESC
    LIMIT ${pedido.limite + 1}`;
}

export function buscarPrincipal(id: number) {
  return prisma.incidente.findUnique({ where: { id }, select: { id: true, incidentePrincipalId: true } });
}

export async function buscarVisible(id: number) {
  const [incidente] = await prisma.$queryRaw<(PuntoMapa & { severidad: string; direccion: string | null })[]>`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.severidad::text AS severidad,
           i.primer_reporte_en AS "primerReporteEn",
           i.cantidad_reportes AS "cantidadReportes",
           i.direccion
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    WHERE i.id = ${id} AND ${INCIDENTE_VISIBLE}`;
  return incidente;
}

/**
 * Reportes válidos del incidente y de los que se le unieron: de ahí salen los vecinos y las fotos, y en la
 * agrupación la severidad, el último reporte y la foto más parecida. Alcanza con un nivel: un incidente que
 * tiene unidos no se puede unir a otro, así que no hay cadenas. Los reportes desestimados y los que su autor eliminó no cuentan.
 * `id` puede ser un número o una columna de la consulta de afuera (por ejemplo, Prisma.sql`i.id`); los
 * reportes quedan con el alias `r`.
 */
export const REPORTES_DEL_INCIDENTE = (id: number | Prisma.Sql) => Prisma.sql`
  FROM reporte r
  JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
  WHERE (del_incidente.id = ${id} OR del_incidente.incidente_principal_id = ${id})
    AND r.estado_verificacion <> 'DESESTIMADO'
    AND r.eliminado_en IS NULL`;

export async function contarVecinos(id: number) {
  // count() de PostgreSQL llega como bigint: se pasa a número para el JSON.
  const [fila] = await prisma.$queryRaw<{ cantidad: bigint }[]>`
    SELECT count(DISTINCT r.usuario_id) AS cantidad ${REPORTES_DEL_INCIDENTE(id)}`;
  return Number(fila?.cantidad ?? 0);
}

export function listarFotos(id: number) {
  return prisma.$queryRaw<{ id: number }[]>`
    SELECT f.id
    FROM fotografia f
    JOIN (SELECT r.id ${REPORTES_DEL_INCIDENTE(id)}) validos ON validos.id = f.reporte_id
    ORDER BY f.id`;
}
