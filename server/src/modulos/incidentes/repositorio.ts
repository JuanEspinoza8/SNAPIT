import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import type { Filtros } from './esquemas.js';

/**
 * Lo que se ve en el mapa público: ni desestimados, ni caducados, ni los unidos a otro incidente.
 * Un temporal cuya vigencia ya pasó cuenta como caducado aunque todavía no se haya marcado.
 */
const VISIBLE = Prisma.sql`
  i.estado <> 'DESESTIMADO'
  AND i.caducado_en IS NULL
  AND i.incidente_principal_id IS NULL
  AND (i.vigente_hasta IS NULL OR i.vigente_hasta > now())`;

export interface PuntoMapa {
  id: number;
  lat: number;
  lon: number;
  categoriaId: number;
  estado: string;
  enRevision: boolean;
  primerReporteEn: Date;
  cantidadReportes: number;
}

export function listarVisibles(filtros: Filtros) {
  const condiciones = [VISIBLE];
  if (filtros.categoriaId) condiciones.push(Prisma.sql`i.categoria_id = ${filtros.categoriaId}`);
  if (filtros.estado) condiciones.push(Prisma.sql`i.estado = ${filtros.estado}::estado_incidente`);
  if (filtros.desde) condiciones.push(Prisma.sql`i.primer_reporte_en >= ${filtros.desde}`);
  if (filtros.hasta) condiciones.push(Prisma.sql`i.primer_reporte_en <= ${filtros.hasta}`);
  if (filtros.bbox) {
    const { oeste, sur, este, norte } = filtros.bbox;
    // && compara contra el rectángulo usando el índice GIST de incidente.ubicacion.
    condiciones.push(
      Prisma.sql`i.ubicacion && ST_MakeEnvelope(${oeste}, ${sur}, ${este}, ${norte}, 4326)::geography`,
    );
  }

  return prisma.$queryRaw<PuntoMapa[]>`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.primer_reporte_en AS "primerReporteEn",
           i.cantidad_reportes AS "cantidadReportes"
    FROM incidente i
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY i.primer_reporte_en DESC, i.id DESC`;
}

export function buscarPrincipal(id: number) {
  return prisma.incidente.findUnique({ where: { id }, select: { id: true, incidentePrincipalId: true } });
}

export async function buscarVisible(id: number) {
  const [incidente] = await prisma.$queryRaw<
    (PuntoMapa & { direccion: string | null; categoriaNombre: string })[]
  >`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.primer_reporte_en AS "primerReporteEn",
           i.cantidad_reportes AS "cantidadReportes",
           i.direccion
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    WHERE i.id = ${id} AND ${VISIBLE}`;
  return incidente;
}

/**
 * Reportes válidos del incidente y de los que se le unieron: de ahí salen los vecinos y las fotos.
 * Los reportes desestimados no se muestran.
 */
const REPORTES_DEL_INCIDENTE = (id: number) => Prisma.sql`
  FROM reporte r
  JOIN incidente i ON i.id = r.incidente_id
  WHERE (i.id = ${id} OR i.incidente_principal_id = ${id})
    AND r.estado_verificacion <> 'DESESTIMADO'`;

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
