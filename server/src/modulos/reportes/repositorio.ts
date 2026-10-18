import { type OrigenReporte, Prisma, type Severidad, type TipoVigencia } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { INCIDENTE_VISIBLE } from '../incidentes/repositorio.js';

export function buscarCategoriaActiva(id: number) {
  return prisma.categoria.findFirst({ where: { id, activa: true } });
}

/** El valor entero de un parámetro, o null si no está cargado o no es un entero. */
export async function leerParametroEntero(clave: string) {
  const parametro = await prisma.parametroSistema.findUnique({ where: { clave } });
  const valor = Number(parametro?.valor);
  return parametro && Number.isInteger(valor) ? valor : null;
}

/** La consulta a la IA que dio una sugerencia, y si ya la usó otro reporte. */
export async function buscarSugerencia(registroIaId: number) {
  const registro = await prisma.registroIa.findUnique({
    where: { id: registroIaId },
    select: {
      usuarioId: true,
      tipo: true,
      exito: true,
      salida: true,
      _count: { select: { reportes: true } },
    },
  });
  if (!registro) return null;
  const { _count, ...resto } = registro;
  return { ...resto, usada: _count.reportes > 0 };
}

/** Lo que sugirió la IA para este reporte y si el vecino lo dejó así. */
export interface SugerenciaDelReporte {
  categoriaSugeridaId: number;
  severidadSugerida: Severidad;
  registroIaId: number;
  sugerenciaAceptada: boolean;
}

export interface NuevoReporte {
  usuarioId: number;
  categoriaId: number;
  severidad: Severidad;
  sugerencia: SugerenciaDelReporte | null;
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
    hashPerceptual: string | null;
    exifLatitud: number | null;
    exifLongitud: number | null;
    exifTomadaEn: Date | null;
    exifMarca: string | null;
    exifModelo: string | null;
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
    // area_id queda vacío: es el área a la que se deriva, y eso lo hace el operador.
    const [incidente] = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO incidente (
        categoria_id, estado, severidad, ubicacion, tipo_vigencia, vigente_hasta,
        cantidad_reportes, primer_reporte_en
      ) VALUES (
        ${datos.categoriaId}, 'REGISTRADO', ${datos.severidad}::severidad,
        ST_SetSRID(ST_MakePoint(${datos.lon}, ${datos.lat}), 4326)::geography,
        ${datos.tipoVigencia}::tipo_vigencia, ${datos.vigenteHasta}, 1, ${datos.registradoEn}
      )
      RETURNING id`;

    const sugerencia = datos.sugerencia;
    const [reporte] = await tx.$queryRaw<
      { id: number; nivelConfianza: number; estadoVerificacion: string }[]
    >`
      INSERT INTO reporte (
        incidente_id, usuario_id, categoria_id, severidad_declarada, descripcion, ubicacion, origen,
        registrado_en, sincronizado_en,
        categoria_sugerida_id, severidad_sugerida, sugerencia_aceptada, registro_ia_id
      ) VALUES (
        ${incidente!.id}, ${datos.usuarioId}, ${datos.categoriaId}, ${datos.severidad}::severidad,
        ${datos.descripcion}, ST_SetSRID(ST_MakePoint(${datos.lon}, ${datos.lat}), 4326)::geography,
        ${datos.origen}::origen_reporte, ${datos.registradoEn}, ${datos.sincronizadoEn},
        ${sugerencia?.categoriaSugeridaId ?? null}, ${sugerencia?.severidadSugerida ?? null}::severidad,
        ${sugerencia?.sugerenciaAceptada ?? null}, ${sugerencia?.registroIaId ?? null}
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

/** Quién pide la foto. Null en lo que no corresponde (sin sesión, o un vecino no tiene organismo). */
export interface PedidoFoto {
  usuarioId: number | null;
  organismoId: number | null;
}

/**
 * Una foto que puede ver quien la pide. Cualquiera, la de un reporte no desestimado cuyo incidente
 * (o el principal, si se unió a otro) está en el mapa. El dueño, las de sus reportes. Un operador
 * o administrador, las de los incidentes de su organismo: el del área a la que se derivó el
 * principal o, si todavía no se derivó, el del área de su categoría (como la bandeja).
 * Las fotos de los cierres todavía no se sirven.
 */
export async function buscarFotoPermitida(id: number, pedido: PedidoFoto) {
  const permisos = [Prisma.sql`(r.estado_verificacion <> 'DESESTIMADO' AND ${INCIDENTE_VISIBLE})`];
  if (pedido.usuarioId !== null) permisos.push(Prisma.sql`r.usuario_id = ${pedido.usuarioId}`);
  if (pedido.organismoId !== null) permisos.push(Prisma.sql`a.organismo_id = ${pedido.organismoId}`);

  // LEFT JOIN: un reporte que quedó sin incidente sigue siendo de su dueño.
  const [foto] = await prisma.$queryRaw<{ rutaArchivo: string }[]>`
    SELECT f.ruta_archivo AS "rutaArchivo"
    FROM fotografia f
    JOIN reporte r ON r.id = f.reporte_id
    LEFT JOIN incidente propio ON propio.id = r.incidente_id
    LEFT JOIN incidente i ON i.id = coalesce(propio.incidente_principal_id, propio.id)
    LEFT JOIN categoria c ON c.id = i.categoria_id
    LEFT JOIN area a ON a.id = coalesce(i.area_id, c.area_id)
    WHERE f.id = ${id}
      AND (${Prisma.join(permisos, ' OR ')})`;
  return foto;
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
 * Los reportes del usuario, del más nuevo al más viejo. Si su incidente se unió a otro, trae el
 * principal (el que sigue avanzando). Alcanza con un nivel: un incidente que tiene unidos no se puede
 * unir a otro, así que no hay cadenas.
 */
export function listarDeUsuario(usuarioId: number) {
  return prisma.$queryRaw<FilaMiReporte[]>`
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
    LEFT JOIN incidente propio ON propio.id = r.incidente_id
    LEFT JOIN incidente p ON p.id = coalesce(propio.incidente_principal_id, propio.id)
    WHERE r.usuario_id = ${usuarioId}
    ORDER BY r.registrado_en DESC, r.id DESC`;
}
