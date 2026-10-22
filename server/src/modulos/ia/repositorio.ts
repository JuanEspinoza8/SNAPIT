import { type EstadoEventoIa, Prisma, type TipoIa } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';

export interface IntentoIa {
  usuarioId: number | null;
  tipo: TipoIa;
  modelo: string;
  entrada: string;
  /** Lo que respondió el modelo: el JSON ya validado, o el texto crudo si no se pudo usar. */
  salida: Prisma.InputJsonValue | null;
  duracionMs: number;
  exito: boolean;
  error: string | null;
}

/** Guarda un intento en registro_ia, haya salido bien o mal. Devuelve su id. */
export async function registrarIntento(intento: IntentoIa) {
  const { id } = await prisma.registroIa.create({
    data: {
      ...intento,
      proveedor: 'ANTHROPIC',
      salida: intento.salida ?? Prisma.DbNull,
    },
    select: { id: true },
  });
  return id;
}

// Cola de verificación con IA (ia/cola.ts): el log de cada procesamiento, en evento_verificacion_ia.

export interface NuevoEvento {
  procesoId: string;
  organismoId: number;
  usuarioId: number;
  reporteId: number;
  estado: EstadoEventoIa;
  detalle: string;
  registroIaId?: number;
  tokensEntrada?: number;
  tokensSalida?: number;
}

export function registrarEvento(evento: NuevoEvento) {
  return prisma.eventoVerificacionIa.create({ data: evento, select: { id: true } });
}

export interface FilaEvento {
  id: number;
  organismoId: number;
  reporteId: number;
  estado: EstadoEventoIa;
  detalle: string | null;
  creadoEn: Date;
  registroIaId: number | null;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  modelo: string | null;
  duracionMs: number | null;
  /** Lo que respondió la IA (registro_ia.salida): categoriaId, severidad y explicacion. */
  propuesta: { categoriaId?: number; severidad?: string; explicacion?: string } | null;
  categoriaId: number;
  categoriaNombre: string;
  severidadDeclarada: string;
  incidenteId: number | null;
  fotoId: number | null;
}

/** Los pasos del procesamiento, en orden, con lo que el panel muestra de cada reporte. */
export function eventosDelProceso(procesoId: string) {
  return prisma.$queryRaw<FilaEvento[]>`
    SELECT e.id, e.organismo_id AS "organismoId", e.reporte_id AS "reporteId", e.estado::text AS estado,
           e.detalle, e.creado_en AS "creadoEn", e.registro_ia_id AS "registroIaId",
           e.tokens_entrada AS "tokensEntrada", e.tokens_salida AS "tokensSalida",
           ri.modelo, ri.duracion_ms AS "duracionMs", ri.salida AS propuesta,
           r.categoria_id AS "categoriaId", c.nombre AS "categoriaNombre",
           r.severidad_declarada::text AS "severidadDeclarada",
           coalesce(i.incidente_principal_id, i.id) AS "incidenteId",
           (SELECT f.id FROM fotografia f WHERE f.reporte_id = r.id ORDER BY f.id LIMIT 1) AS "fotoId"
    FROM evento_verificacion_ia e
    JOIN reporte r ON r.id = e.reporte_id
    JOIN categoria c ON c.id = r.categoria_id
    LEFT JOIN incidente i ON i.id = r.incidente_id
    LEFT JOIN registro_ia ri ON ri.id = e.registro_ia_id
    WHERE e.proceso_id = ${procesoId}::uuid
    ORDER BY e.id`;
}

/** Los últimos procesamientos del organismo, del más nuevo al más viejo. */
export function procesosRecientes(organismoId: number, cantidad = 10) {
  return prisma.$queryRaw<
    {
      id: string;
      iniciadoEn: Date;
      reportes: number;
      publicados: number;
      derivados: number;
      errores: number;
    }[]
  >`
    SELECT proceso_id::text AS id, min(creado_en) AS "iniciadoEn",
           count(DISTINCT reporte_id)::int AS reportes,
           count(*) FILTER (WHERE estado = 'PUBLICADO')::int AS publicados,
           count(*) FILTER (WHERE estado = 'REVISION_MANUAL')::int AS derivados,
           count(*) FILTER (WHERE estado = 'ERROR')::int AS errores
    FROM evento_verificacion_ia
    WHERE organismo_id = ${organismoId}
    GROUP BY proceso_id
    ORDER BY min(creado_en) DESC
    LIMIT ${cantidad}`;
}
