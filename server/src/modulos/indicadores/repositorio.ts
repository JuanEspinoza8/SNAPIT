import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { ZONA_HORARIA } from '../../tareas/prioridadDiaria.js';
import { CON_AREA } from '../bandeja/repositorio.js';
import { BARRIO, INCIDENTE_VISIBLE } from '../incidentes/repositorio.js';
import { PRIORIDAD_EFECTIVA } from '../prioridad/repositorio.js';
import { DEL_ORGANISMO } from '../verificacion/repositorio.js';
import type { Resuelto } from './calculo.js';

export interface FiltrosIndicadores {
  organismoId: number;
  areaId?: number;
  desde?: Date;
  hasta?: Date;
}

/**
 * Abierto: lo que se ve en el mapa y todavía no se resolvió. Así quedan afuera los unidos a otro, los
 * caducados y los temporales vencidos aunque la tarea diaria no los haya marcado. Va con el alias `i`.
 */
const ABIERTO = Prisma.sql`${INCIDENTE_VISIBLE} AND i.estado <> 'RESUELTO'`;

/** Un incidente que no está unido a otro (lo suyo cuenta en el principal) y que se resolvió. */
const RESUELTO = Prisma.sql`i.incidente_principal_id IS NULL AND i.estado = 'RESUELTO' AND i.resuelto_en IS NOT NULL`;

/**
 * El organismo, el área responsable (alias `a`) y el período, mirado sobre la fecha que le da sentido a cada
 * indicador: el primer reporte, la resolución o la carga del reporte.
 */
function filtrar(filtros: FiltrosIndicadores, fecha: Prisma.Sql) {
  const condiciones = [Prisma.sql`a.organismo_id = ${filtros.organismoId}`];
  if (filtros.areaId) condiciones.push(Prisma.sql`a.id = ${filtros.areaId}`);
  if (filtros.desde) condiciones.push(Prisma.sql`${fecha} >= ${filtros.desde}`);
  if (filtros.hasta) condiciones.push(Prisma.sql`${fecha} <= ${filtros.hasta}`);
  return Prisma.join(condiciones, ' AND ');
}

const PRIMER_REPORTE = Prisma.sql`i.primer_reporte_en`;
const RESOLUCION = Prisma.sql`i.resuelto_en`;

/** Los abiertos cuyo primer reporte cae en el período, por estado. Un estado sin incidentes no viene. */
export function contarAbiertosPorEstado(filtros: FiltrosIndicadores) {
  return prisma.$queryRaw<{ estado: string; cantidad: number }[]>`
    SELECT i.estado::text AS estado, count(*)::int AS cantidad
    ${CON_AREA}
    WHERE ${ABIERTO} AND ${filtrar(filtros, PRIMER_REPORTE)}
    GROUP BY i.estado`;
}

/** La semana (de lunes a domingo, en hora de Argentina) de un momento, como el lunes a las 0:00. */
const semanaDe = (momento: Prisma.Sql) =>
  Prisma.sql`date_trunc('week', ${momento} AT TIME ZONE ${ZONA_HORARIA})`;

/**
 * Nuevos contra resueltos, una fila por semana y también las que quedan en 0: de la semana de `desde` (o la
 * del dato más viejo) a la de `hasta` (o la actual). Nuevo es un incidente cuyo primer reporte cae en esa
 * semana, sin contar los unidos ni los desestimados; resuelto, uno que se resolvió en esa semana. Las semanas
 * de los bordes pueden quedar partidas por el período: solo cuenta lo que cae adentro.
 */
export function contarPorSemana(filtros: FiltrosIndicadores) {
  return prisma.$queryRaw<{ semana: string; nuevos: number; resueltos: number }[]>`
    WITH nuevos AS (
      SELECT ${semanaDe(PRIMER_REPORTE)} AS semana
      ${CON_AREA}
      WHERE i.incidente_principal_id IS NULL AND i.estado <> 'DESESTIMADO'
        AND ${filtrar(filtros, PRIMER_REPORTE)}
    ), resueltos AS (
      SELECT ${semanaDe(RESOLUCION)} AS semana
      ${CON_AREA}
      WHERE ${RESUELTO} AND ${filtrar(filtros, RESOLUCION)}
    ), limites AS (
      SELECT coalesce(${semanaDe(Prisma.sql`${filtros.desde ?? null}::timestamptz`)},
                      (SELECT min(semana) FROM (SELECT semana FROM nuevos UNION ALL SELECT semana FROM resueltos) t))
               AS primera,
             ${semanaDe(Prisma.sql`coalesce(${filtros.hasta ?? null}::timestamptz, now())`)} AS ultima
    )
    SELECT to_char(s.semana, 'YYYY-MM-DD') AS semana,
           (SELECT count(*)::int FROM nuevos n WHERE n.semana = s.semana) AS nuevos,
           (SELECT count(*)::int FROM resueltos r WHERE r.semana = s.semana) AS resueltos
    FROM limites, generate_series(limites.primera, limites.ultima, interval '1 week') AS s(semana)
    ORDER BY s.semana`;
}

/** Los resueltos en el período, con su categoría, su área, su barrio y los días que tardaron. */
export function listarResueltos(filtros: FiltrosIndicadores) {
  return prisma.$queryRaw<Resuelto[]>`
    SELECT c.id AS "categoriaId", c.nombre AS "categoriaNombre", a.id AS "areaId", a.nombre AS "areaNombre",
           ${BARRIO} AS barrio,
           (extract(epoch FROM i.resuelto_en - i.primer_reporte_en) / 86400)::float8 AS dias
    ${CON_AREA}
    WHERE ${RESUELTO} AND ${filtrar(filtros, RESOLUCION)}`;
}

/** Los abiertos del período por barrio. Los que todavía no tienen dirección no entran en ninguno. */
export function contarAbiertosPorBarrio(filtros: FiltrosIndicadores) {
  return prisma.$queryRaw<{ barrio: string; cantidad: number }[]>`
    SELECT ${BARRIO} AS barrio, count(*)::int AS cantidad
    ${CON_AREA}
    WHERE ${ABIERTO} AND i.direccion IS NOT NULL AND ${filtrar(filtros, PRIMER_REPORTE)}
    GROUP BY 1`;
}

/**
 * Los reportes cargados en el período y cuántos se desestimaron. Un reporte es del área responsable del
 * incidente que manda (el principal, si el suyo se unió a otro), como en GET /api/reportes. Cuentan todos:
 * los pendientes y los que su autor eliminó también se recibieron.
 */
export async function contarReportes(filtros: FiltrosIndicadores) {
  const [fila] = await prisma.$queryRaw<{ total: number; desestimados: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE r.estado_verificacion = 'DESESTIMADO')::int AS desestimados
    ${DEL_ORGANISMO}
    WHERE ${filtrar(filtros, Prisma.sql`r.registrado_en`)}`;
  return fila ?? { total: 0, desestimados: 0 };
}

/** Dónde están los abiertos del período y su prioridad (la manual, si la hay). */
export function listarPuntosAbiertos(filtros: FiltrosIndicadores) {
  return prisma.$queryRaw<{ lat: number; lon: number; prioridad: number }[]>`
    SELECT ST_Y(i.ubicacion::geometry) AS lat, ST_X(i.ubicacion::geometry) AS lon,
           ${PRIORIDAD_EFECTIVA}::float8 AS prioridad
    ${CON_AREA}
    WHERE ${ABIERTO} AND ${filtrar(filtros, PRIMER_REPORTE)}
    ORDER BY i.id`;
}
