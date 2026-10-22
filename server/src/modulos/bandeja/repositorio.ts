import { type EstadoIncidente, type EstadoVerificacion, Prisma, type TipoSenal } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { INCIDENTE_VISIBLE } from '../incidentes/repositorio.js';
import { PRIORIDAD_EFECTIVA } from '../prioridad/repositorio.js';
import { ESTADOS_BANDEJA } from './esquemas.js';

/**
 * El incidente con su categoría (`c`) y su área responsable (`a`): la del área a la que se derivó o, si
 * todavía no se derivó, la de su categoría. El organismo del incidente es el de esa área.
 */
const CON_AREA = Prisma.sql`
  FROM incidente i
  JOIN categoria c ON c.id = i.categoria_id
  JOIN area a ON a.id = coalesce(i.area_id, c.area_id)`;

export interface FiltrosBandeja {
  organismoId: number;
  areaId?: number;
  estado?: (typeof ESTADOS_BANDEJA)[number];
  categoriaId?: number;
}

export interface FilaBandeja {
  id: number;
  estado: EstadoIncidente;
  categoriaId: number;
  categoriaNombre: string;
  areaId: number;
  areaNombre: string;
  direccion: string | null;
  cantidadReportes: number;
  primerReporteEn: Date;
  puntajePrioridad: number;
  prioridadManual: number | null;
  motivos: { factor: string; valor: number; detalle: string | null }[];
}

/**
 * Lo que el organismo tiene que atender: los incidentes del mapa (ni unidos, ni caducados, ni vencidos) que
 * ya se verificaron y todavía no se resolvieron. Primero el de mayor prioridad, la manual si la hay; ante un
 * empate, el que lleva más tiempo.
 */
export function listarBandeja(filtros: FiltrosBandeja) {
  const condiciones = [
    INCIDENTE_VISIBLE,
    Prisma.sql`i.estado::text IN (${Prisma.join(ESTADOS_BANDEJA)})`,
    Prisma.sql`a.organismo_id = ${filtros.organismoId}`,
  ];
  if (filtros.areaId) condiciones.push(Prisma.sql`a.id = ${filtros.areaId}`);
  if (filtros.estado) condiciones.push(Prisma.sql`i.estado = ${filtros.estado}::estado_incidente`);
  if (filtros.categoriaId) condiciones.push(Prisma.sql`i.categoria_id = ${filtros.categoriaId}`);

  return prisma.$queryRaw<FilaBandeja[]>`
    SELECT i.id, i.estado::text AS estado,
           c.id AS "categoriaId", c.nombre AS "categoriaNombre",
           a.id AS "areaId", a.nombre AS "areaNombre",
           i.direccion, i.cantidad_reportes AS "cantidadReportes", i.primer_reporte_en AS "primerReporteEn",
           i.puntaje_prioridad::float8 AS "puntajePrioridad", i.prioridad_manual::float8 AS "prioridadManual",
           (SELECT coalesce(json_agg(json_build_object('factor', f.factor, 'valor', f.valor::float8,
                                                       'detalle', f.detalle) ORDER BY f.id), '[]')
            FROM factor_prioridad f WHERE f.incidente_id = i.id) AS motivos
    ${CON_AREA}
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY ${PRIORIDAD_EFECTIVA} DESC, i.primer_reporte_en, i.id`;
}

export async function esAreaDelOrganismo(areaId: number, organismoId: number) {
  return (await prisma.area.count({ where: { id: areaId, organismoId } })) > 0;
}

export interface IncidenteGestion {
  id: number;
  estado: EstadoIncidente;
  categoriaId: number;
  categoriaNombre: string;
  areaId: number;
  areaNombre: string;
  organismoId: number;
  severidad: string;
  direccion: string | null;
  lat: number;
  lon: number;
  tipoVigencia: string;
  vigenteHasta: Date | null;
  caducadoEn: Date | null;
  primerReporteEn: Date;
  resueltoEn: Date | null;
  cantidadReportes: number;
  incidentePrincipalId: number | null;
}

/** El incidente en cualquier estado, también unido o caducado. Undefined si no existe. */
export async function buscarIncidente(id: number) {
  const [fila] = await prisma.$queryRaw<IncidenteGestion[]>`
    SELECT i.id, i.estado::text AS estado,
           c.id AS "categoriaId", c.nombre AS "categoriaNombre",
           a.id AS "areaId", a.nombre AS "areaNombre", a.organismo_id AS "organismoId",
           i.severidad::text AS severidad, i.direccion,
           ST_Y(i.ubicacion::geometry) AS lat, ST_X(i.ubicacion::geometry) AS lon,
           i.tipo_vigencia::text AS "tipoVigencia", i.vigente_hasta AS "vigenteHasta", i.caducado_en AS "caducadoEn",
           i.primer_reporte_en AS "primerReporteEn", i.resuelto_en AS "resueltoEn",
           i.cantidad_reportes AS "cantidadReportes", i.incidente_principal_id AS "incidentePrincipalId"
    ${CON_AREA}
    WHERE i.id = ${id}`;
  return fila;
}

export function listarUnidos(id: number) {
  return prisma.incidente.findMany({
    where: { incidentePrincipalId: id },
    select: { id: true, estado: true },
    orderBy: { id: 'asc' },
  });
}

export interface FilaReporte {
  id: number;
  incidenteId: number;
  registradoEn: Date;
  categoriaId: number;
  categoriaNombre: string;
  severidadDeclarada: string;
  descripcion: string | null;
  direccion: string | null;
  lat: number;
  lon: number;
  origen: string;
  nivelConfianza: number;
  estadoVerificacion: EstadoVerificacion;
  senales: { tipo: TipoSenal; valor: number; detalle: string | null }[];
  fotos: number[];
}

/**
 * Todos los reportes del incidente y de los que se le unieron, también los desestimados, con la categoría
 * que eligió cada vecino, su confianza y sus señales. Del más viejo al más nuevo.
 */
export function listarReportes(id: number) {
  return prisma.$queryRaw<FilaReporte[]>`
    SELECT r.id, r.incidente_id AS "incidenteId", r.registrado_en AS "registradoEn",
           r.categoria_id AS "categoriaId", rc.nombre AS "categoriaNombre",
           r.severidad_declarada::text AS "severidadDeclarada", r.descripcion, r.direccion,
           ST_Y(r.ubicacion::geometry) AS lat, ST_X(r.ubicacion::geometry) AS lon,
           r.origen::text AS origen, r.nivel_confianza AS "nivelConfianza",
           r.estado_verificacion::text AS "estadoVerificacion",
           (SELECT coalesce(json_agg(json_build_object('tipo', s.tipo, 'valor', s.valor::float8,
                                                       'detalle', s.detalle) ORDER BY s.id), '[]')
            FROM senal_verificacion s WHERE s.reporte_id = r.id) AS senales,
           (SELECT coalesce(array_agg(f.id ORDER BY f.id), '{}') FROM fotografia f WHERE f.reporte_id = r.id) AS fotos
    FROM reporte r
    JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
    JOIN categoria rc ON rc.id = r.categoria_id
    WHERE del_incidente.id = ${id} OR del_incidente.incidente_principal_id = ${id}
    ORDER BY r.registrado_en, r.id`;
}

export function buscarCierre(incidenteId: number) {
  return prisma.cierreIncidente.findUnique({
    where: { incidenteId },
    select: {
      id: true,
      resultadoComparacion: true,
      distanciaMetros: true,
      detalleComparacion: true,
      creadoEn: true,
      usuario: { select: { id: true, nombre: true } },
      fotografias: { select: { id: true }, orderBy: { id: 'asc' } },
    },
  });
}
