import {
  type EstadoIncidente,
  type EstadoVerificacion,
  Prisma,
  type Severidad,
  type TipoSenal,
} from '@prisma/client';
import { distanciaHammingSql } from '../../compartido/hashPerceptual.js';
import {
  bitsDelHash,
  deCeroACien,
  type DefinicionParametros,
  leerParametrosNumericos,
  noNegativo,
} from '../../compartido/parametros.js';
import { prisma } from '../../compartido/prisma.js';
import { REPORTES_DEL_INCIDENTE } from '../incidentes/repositorio.js';
import { calcularReputacion, type ParametrosVerificacion } from './calculo.js';

// Los mismos valores que carga la semilla: si falta un parámetro, se verifica igual con estos. Los valores de
// las señales (valor_*) pueden ser negativos; el resto no.
const PARAMETROS: DefinicionParametros<keyof ParametrosVerificacion> = {
  confianzaBase: { clave: 'verificacion.confianza_base', valor: 50, valido: deCeroACien },
  umbralVerificado: { clave: 'verificacion.umbral_verificado', valor: 60, valido: deCeroACien },
  distanciaExifMaxM: { clave: 'verificacion.distancia_exif_max_m', valor: 100, valido: noNegativo },
  valorExifCoincide: { clave: 'verificacion.valor_exif_coincide', valor: 20 },
  valorExifNoCoincide: { clave: 'verificacion.valor_exif_no_coincide', valor: -30 },
  valorExifAusente: { clave: 'verificacion.valor_exif_ausente', valor: -10 },
  hammingDuplicadoMax: { clave: 'verificacion.hamming_duplicado_max', valor: 6, valido: bitsDelHash },
  valorHashDuplicado: { clave: 'verificacion.valor_hash_duplicado', valor: -40 },
  valorOrigenApp: { clave: 'verificacion.valor_origen_app', valor: 15 },
  valorReputacionMax: { clave: 'verificacion.valor_reputacion_max', valor: 20 },
  diasFotoAntigua: { clave: 'verificacion.dias_foto_antigua', valor: 7, valido: noNegativo },
  valorFechaAntigua: { clave: 'verificacion.valor_fecha_antigua', valor: -20 },
};

/** Los parámetros verificacion.* de parametro_sistema. */
export function leerParametros(): Promise<ParametrosVerificacion> {
  return leerParametrosNumericos(PARAMETROS);
}

export async function leerReputacion(usuarioId: number) {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { reputacion: true },
  });
  return Number(usuario.reputacion);
}

/**
 * La foto ya guardada más parecida a la nueva, si está a no más de `hammingMax` bits. Compara contra las
 * fotos de todos los reportes, también los del mismo vecino: subir dos veces la misma foto tampoco suma.
 * Deja afuera las guardadas con `hammingMax` unos o menos: son fotos lisas u oscuras, que quedan a esa
 * distancia de cualquier otra foto lisa.
 */
export async function buscarFotoRepetida(datos: { hash: string; usuarioId: number; hammingMax: number }) {
  const distancia = distanciaHammingSql(Prisma.sql`f.hash_perceptual`, Prisma.sql`${datos.hash}::bit(64)`);
  const [foto] = await prisma.$queryRaw<{ reporteId: number; hamming: number; mismoVecino: boolean }[]>`
    SELECT r.id AS "reporteId", ${distancia}::int AS hamming, r.usuario_id = ${datos.usuarioId} AS "mismoVecino"
    FROM fotografia f
    JOIN reporte r ON r.id = f.reporte_id
    WHERE f.hash_perceptual IS NOT NULL
      AND bit_count(f.hash_perceptual) > ${datos.hammingMax}
      AND ${distancia} <= ${datos.hammingMax}
    ORDER BY hamming, r.id
    LIMIT 1`;
  return foto ?? null;
}

type Tx = Prisma.TransactionClient;

/**
 * El incidente que manda para un reporte: el suyo o, si se unió a otro, el principal (#54). Va con los
 * alias `r` (reporte), `i` (incidente que manda) y `a` (área responsable): la del área a la que se derivó
 * o, si todavía no se derivó, la de su categoría, como en las fotos (#49) y la bandeja.
 */
const DEL_ORGANISMO = Prisma.sql`
  FROM reporte r
  LEFT JOIN incidente propio ON propio.id = r.incidente_id
  LEFT JOIN incidente i ON i.id = coalesce(propio.incidente_principal_id, propio.id)
  JOIN categoria c ON c.id = coalesce(i.categoria_id, r.categoria_id)
  JOIN area a ON a.id = coalesce(i.area_id, c.area_id)`;

export interface FilaPendiente {
  id: number;
  registradoEn: Date;
  categoriaId: number;
  categoriaNombre: string;
  severidadDeclarada: Severidad;
  descripcion: string | null;
  direccion: string | null;
  lat: number;
  lon: number;
  origen: string;
  nivelConfianza: number;
  senales: { tipo: TipoSenal; valor: string; detalle: string | null }[];
  fotos: number[];
  incidenteId: number | null;
  incidenteEstado: EstadoIncidente | null;
  cantidadReportes: number | null;
  reputacion: string;
  reportesConfirmados: number;
  reportesDesestimados: number;
}

/** Los reportes pendientes de revisión de los incidentes del organismo, del más viejo al más nuevo. */
export function listarPendientes(organismoId: number) {
  return prisma.$queryRaw<FilaPendiente[]>`
    SELECT r.id, r.registrado_en AS "registradoEn", r.categoria_id AS "categoriaId",
           rc.nombre AS "categoriaNombre", r.severidad_declarada::text AS "severidadDeclarada",
           r.descripcion, r.direccion, ST_Y(r.ubicacion::geometry) AS lat, ST_X(r.ubicacion::geometry) AS lon,
           r.origen::text AS origen, r.nivel_confianza AS "nivelConfianza",
           (SELECT coalesce(json_agg(json_build_object('tipo', s.tipo, 'valor', s.valor, 'detalle', s.detalle)
                                     ORDER BY s.id), '[]')
            FROM senal_verificacion s WHERE s.reporte_id = r.id) AS senales,
           (SELECT coalesce(array_agg(f.id ORDER BY f.id), '{}') FROM fotografia f WHERE f.reporte_id = r.id) AS fotos,
           i.id AS "incidenteId", i.estado::text AS "incidenteEstado", i.cantidad_reportes AS "cantidadReportes",
           u.reputacion::text AS reputacion, u.reportes_confirmados AS "reportesConfirmados",
           u.reportes_desestimados AS "reportesDesestimados"
    ${DEL_ORGANISMO}
    JOIN categoria rc ON rc.id = r.categoria_id
    JOIN usuario u ON u.id = r.usuario_id
    WHERE r.estado_verificacion = 'PENDIENTE_REVISION'
      AND a.organismo_id = ${organismoId}
    ORDER BY r.registrado_en, r.id`;
}

/**
 * El reporte a revisar, bloqueado hasta que termine la transacción: si dos operadores lo revisan a la vez,
 * el segundo espera y lo encuentra ya revisado. Undefined si no existe.
 */
export async function bloquearReporte(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<{ estado: EstadoVerificacion; organismoId: number }[]>`
    SELECT r.estado_verificacion::text AS estado, a.organismo_id AS "organismoId"
    ${DEL_ORGANISMO}
    WHERE r.id = ${id}
    FOR UPDATE OF r`;
  return fila;
}

export function cambiarEstadoReporte(tx: Tx, id: number, estado: EstadoVerificacion) {
  return tx.reporte.update({ where: { id }, data: { estadoVerificacion: estado } });
}

/** Del reporte, lo que hace falta para aplicar su resultado: su vecino, su confianza y el incidente que manda. */
export async function leerReporte(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<
    { usuarioId: number; nivelConfianza: number; incidenteId: number | null }[]
  >`
    SELECT r.usuario_id AS "usuarioId", r.nivel_confianza AS "nivelConfianza", i.id AS "incidenteId"
    FROM reporte r
    LEFT JOIN incidente propio ON propio.id = r.incidente_id
    LEFT JOIN incidente i ON i.id = coalesce(propio.incidente_principal_id, propio.id)
    WHERE r.id = ${id}`;
  if (!fila) throw new Error(`No existe el reporte ${id}`);
  return fila;
}

/**
 * Suma el reporte al historial del vecino y recalcula su reputación. Bloquea la fila: dos resultados del
 * mismo vecino a la vez no pisan sus contadores. Devuelve la reputación nueva.
 */
export async function sumarAlHistorial(tx: Tx, usuarioId: number, decision: 'VERIFICADO' | 'DESESTIMADO') {
  const [vecino] = await tx.$queryRaw<{ confirmados: number; desestimados: number }[]>`
    SELECT reportes_confirmados AS confirmados, reportes_desestimados AS desestimados
    FROM usuario WHERE id = ${usuarioId} FOR UPDATE`;
  const confirmados = vecino!.confirmados + (decision === 'VERIFICADO' ? 1 : 0);
  const desestimados = vecino!.desestimados + (decision === 'DESESTIMADO' ? 1 : 0);
  const reputacion = calcularReputacion(confirmados, desestimados);
  await tx.usuario.update({
    where: { id: usuarioId },
    data: { reportesConfirmados: confirmados, reportesDesestimados: desestimados, reputacion },
  });
  return reputacion;
}

/** El estado del incidente, bloqueado hasta que termine la transacción. */
export async function bloquearIncidente(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<{ estado: EstadoIncidente }[]>`
    SELECT estado::text AS estado FROM incidente WHERE id = ${id} FOR UPDATE`;
  return fila!.estado;
}

/** Cuántos reportes no desestimados le quedan al incidente, contando los de los incidentes unidos. */
export async function contarReportesValidos(tx: Tx, incidenteId: number) {
  const [fila] = await tx.$queryRaw<{ cantidad: number }[]>`
    SELECT count(*)::int AS cantidad ${REPORTES_DEL_INCIDENTE(incidenteId)}`;
  return fila!.cantidad;
}

export function actualizarIncidente(
  tx: Tx,
  id: number,
  datos: { estado?: EstadoIncidente; severidad?: Severidad },
) {
  return tx.incidente.update({ where: { id }, data: { ...datos, actualizadoEn: new Date() } });
}

export function registrarMovimiento(
  tx: Tx,
  movimiento: {
    incidenteId: number;
    usuarioId: number | null;
    tipo: 'CAMBIO_ESTADO' | 'COMENTARIO';
    estadoAnterior?: EstadoIncidente;
    estadoNuevo?: EstadoIncidente;
    comentario: string;
  },
) {
  return tx.movimientoIncidente.create({ data: movimiento });
}
