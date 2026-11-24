import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { CON_AREA } from '../bandeja/repositorio.js';
import { BARRIO } from '../incidentes/repositorio.js';
import { ABIERTO, type FiltrosIndicadores, filtrar, PRIMER_REPORTE } from '../indicadores/repositorio.js';
import { PRIORIDAD_EFECTIVA } from '../prioridad/repositorio.js';
import type { Prioritario } from './calculo.js';

/**
 * Las categorías con más incidentes nuevos en el período (como los nuevos de los indicadores: sin los unidos
 * a otro ni los desestimados), y cuántos de esos siguen abiertos.
 */
export function contarPorCategoria(filtros: FiltrosIndicadores, cantidad = 10) {
  return prisma.$queryRaw<{ id: number; nombre: string; nuevos: number; abiertos: number }[]>`
    SELECT c.id, c.nombre, count(*)::int AS nuevos, count(*) FILTER (WHERE ${ABIERTO})::int AS abiertos
    ${CON_AREA}
    WHERE i.incidente_principal_id IS NULL AND i.estado <> 'DESESTIMADO'
      AND ${filtrar(filtros, PRIMER_REPORTE)}
    GROUP BY c.id, c.nombre
    ORDER BY nuevos DESC, c.id
    LIMIT ${cantidad}`;
}

/**
 * Los abiertos hoy con mayor prioridad (la manual, si la hay), reportados hasta el fin del período: sin límite
 * hacia atrás, porque lo que viene de antes y sigue abierto también hay que atenderlo. Los reportes cuentan los
 * del incidente y los de los unidos a él, sin los que su autor eliminó.
 */
export function listarMasPrioritarios(filtros: FiltrosIndicadores, cantidad = 10) {
  return prisma.$queryRaw<Prioritario[]>`
    SELECT i.id, c.nombre AS categoria, a.nombre AS area, i.estado::text AS estado,
           ${PRIORIDAD_EFECTIVA}::float8 AS prioridad, i.direccion, ${BARRIO} AS barrio,
           round((extract(epoch FROM now() - i.primer_reporte_en) / 86400)::numeric, 1)::float8 AS "diasAbierto",
           (SELECT count(*) FROM reporte r JOIN incidente ir ON ir.id = r.incidente_id
            WHERE (ir.id = i.id OR ir.incidente_principal_id = i.id) AND r.eliminado_en IS NULL)::int AS reportes
    ${CON_AREA}
    WHERE ${ABIERTO} AND ${filtrar({ ...filtros, desde: undefined }, PRIMER_REPORTE)}
    ORDER BY ${PRIORIDAD_EFECTIVA} DESC, i.primer_reporte_en, i.id
    LIMIT ${cantidad}`;
}

export function nombresDe(organismoId: number, areaId: number | undefined) {
  return Promise.all([
    prisma.organismo.findUniqueOrThrow({ where: { id: organismoId }, select: { nombre: true } }),
    areaId ? prisma.area.findUniqueOrThrow({ where: { id: areaId }, select: { nombre: true } }) : null,
  ]);
}

export interface NuevoInforme {
  usuarioId: number;
  areaId: number | null;
  registroIaId: number;
  /** AAAA-MM-DD. */
  desde: string;
  hasta: string;
  contenido: string;
  metricas: Prisma.InputJsonValue;
}

const SELECCION = {
  id: true,
  periodoDesde: true,
  periodoHasta: true,
  metricas: true,
  creadoEn: true,
  registroIaId: true,
  area: { select: { id: true, nombre: true } },
  usuario: { select: { id: true, nombre: true } },
} satisfies Prisma.InformeSelect;

export function guardar(informe: NuevoInforme) {
  return prisma.informe.create({
    data: {
      usuarioId: informe.usuarioId,
      areaId: informe.areaId,
      registroIaId: informe.registroIaId,
      // Las columnas son date: el día va tal cual, sin hora ni zona.
      periodoDesde: new Date(`${informe.desde}T00:00:00Z`),
      periodoHasta: new Date(`${informe.hasta}T00:00:00Z`),
      contenido: informe.contenido,
      metricas: informe.metricas,
    },
    select: { ...SELECCION, contenido: true },
  });
}

/**
 * Los informes de un organismo, del más nuevo al más viejo. El organismo sale de las métricas guardadas
 * (filtros.organismoId): un informe sin área no tiene otra columna que lo ate a su organismo.
 */
const DEL_ORGANISMO = (organismoId: number) =>
  ({
    metricas: { path: ['filtros', 'organismoId'], equals: organismoId },
  }) satisfies Prisma.InformeWhereInput;

export function listar(organismoId: number, cantidad = 50) {
  return prisma.informe.findMany({
    where: DEL_ORGANISMO(organismoId),
    orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
    take: cantidad,
    select: SELECCION,
  });
}

export function buscar(id: number, organismoId: number) {
  return prisma.informe.findFirst({
    where: { id, ...DEL_ORGANISMO(organismoId) },
    select: { ...SELECCION, contenido: true },
  });
}
