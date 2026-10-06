import type { OrigenReporte, Severidad, TipoVigencia } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';

export function buscarCategoriaActiva(id: number) {
  return prisma.categoria.findFirst({ where: { id, activa: true } });
}

export async function leerParametroEntero(clave: string, porDefecto: number) {
  const parametro = await prisma.parametroSistema.findUnique({ where: { clave } });
  const valor = Number(parametro?.valor);
  return Number.isInteger(valor) ? valor : porDefecto;
}

export interface NuevoReporte {
  usuarioId: number;
  categoriaId: number;
  areaId: number;
  severidad: Severidad;
  descripcion: string | null;
  lat: number;
  lon: number;
  origen: OrigenReporte;
  registradoEn: Date;
  sincronizadoEn: Date;
  tipoVigencia: TipoVigencia;
  vigenteHasta: Date | null;
  foto: {
    rutaArchivo: string;
    ancho: number;
    alto: number;
    tamanoBytes: number;
    tomadaConCamaraApp: boolean;
  };
}

/**
 * Crea el incidente, el reporte y la fotografía en una sola transacción: o quedan los tres o ninguno.
 * La ubicación es una columna de PostGIS que Prisma no maneja, por eso los INSERT van en SQL.
 */
export function crearReporteConIncidente(datos: NuevoReporte) {
  // ST_MakePoint recibe primero la longitud y después la latitud.
  return prisma.$transaction(async (tx) => {
    // Mientras no exista la agrupación (corte 50 %), cada reporte abre su propio incidente.
    const [incidente] = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO incidente (
        categoria_id, area_id, estado, severidad, ubicacion, tipo_vigencia, vigente_hasta,
        cantidad_reportes, primer_reporte_en
      ) VALUES (
        ${datos.categoriaId}, ${datos.areaId}, 'REGISTRADO', ${datos.severidad}::severidad,
        ST_SetSRID(ST_MakePoint(${datos.lon}, ${datos.lat}), 4326)::geography,
        ${datos.tipoVigencia}::tipo_vigencia, ${datos.vigenteHasta}, 1, ${datos.registradoEn}
      )
      RETURNING id`;

    const [reporte] = await tx.$queryRaw<
      { id: number; nivelConfianza: number; estadoVerificacion: string }[]
    >`
      INSERT INTO reporte (
        incidente_id, usuario_id, categoria_id, severidad_declarada, descripcion, ubicacion, origen,
        registrado_en, sincronizado_en
      ) VALUES (
        ${incidente!.id}, ${datos.usuarioId}, ${datos.categoriaId}, ${datos.severidad}::severidad,
        ${datos.descripcion}, ST_SetSRID(ST_MakePoint(${datos.lon}, ${datos.lat}), 4326)::geography,
        ${datos.origen}::origen_reporte, ${datos.registradoEn}, ${datos.sincronizadoEn}
      )
      RETURNING id, nivel_confianza AS "nivelConfianza", estado_verificacion::text AS "estadoVerificacion"`;

    await tx.fotografia.create({ data: { reporteId: reporte!.id, ...datos.foto } });

    return {
      id: reporte!.id,
      incidenteId: incidente!.id,
      nivelConfianza: reporte!.nivelConfianza,
      estadoVerificacion: reporte!.estadoVerificacion,
    };
  });
}

export function buscarFoto(id: number) {
  return prisma.fotografia.findUnique({ where: { id }, select: { rutaArchivo: true } });
}

export interface FilaMiReporte {
  id: number;
  registradoEn: Date;
  severidadDeclarada: string;
  descripcion: string | null;
  estadoVerificacion: string;
  categoriaId: number;
  categoriaNombre: string;
  incidenteId: number | null;
  incidenteEstado: string | null;
  fotos: number[];
}

/**
 * Los reportes del usuario, del más nuevo al más viejo. Si su incidente se unió a otro, la consulta
 * sube por incidente_principal_id hasta el principal (el que sigue avanzando) y trae su estado.
 */
export function listarDeUsuario(usuarioId: number) {
  return prisma.$queryRaw<FilaMiReporte[]>`
    WITH RECURSIVE cadena AS (
      SELECT r.id AS reporte_id, i.id, i.incidente_principal_id, i.estado, 0 AS salto
      FROM reporte r
      JOIN incidente i ON i.id = r.incidente_id
      WHERE r.usuario_id = ${usuarioId}
      UNION ALL
      SELECT c.reporte_id, p.id, p.incidente_principal_id, p.estado, c.salto + 1
      FROM cadena c
      JOIN incidente p ON p.id = c.incidente_principal_id
      WHERE c.salto < 10
    ),
    principal AS (
      SELECT DISTINCT ON (reporte_id) reporte_id, id, estado
      FROM cadena
      WHERE incidente_principal_id IS NULL
      ORDER BY reporte_id, salto
    )
    SELECT r.id,
           r.registrado_en AS "registradoEn",
           r.severidad_declarada::text AS "severidadDeclarada",
           r.descripcion,
           r.estado_verificacion::text AS "estadoVerificacion",
           c.id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           p.id AS "incidenteId",
           p.estado::text AS "incidenteEstado",
           COALESCE(
             (SELECT array_agg(f.id ORDER BY f.id) FROM fotografia f WHERE f.reporte_id = r.id),
             '{}'
           ) AS fotos
    FROM reporte r
    JOIN categoria c ON c.id = r.categoria_id
    LEFT JOIN principal p ON p.reporte_id = r.id
    WHERE r.usuario_id = ${usuarioId}
    ORDER BY r.registrado_en DESC, r.id DESC`;
}
