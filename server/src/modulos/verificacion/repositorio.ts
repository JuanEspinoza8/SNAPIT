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
  type DefinicionParametros,
  definirParametros,
  leerParametrosNumericos,
  noNegativo,
} from '../../compartido/parametros.js';
import { prisma } from '../../compartido/prisma.js';
import { CADUCO_EN, MARCADO_PARA_DESESTIMAR } from '../incidentes/repositorio.js';
import { calcularReputacion, type ParametrosVerificacion } from './calculo.js';

// Los mismos valores que carga la semilla: si falta un parámetro, se verifica igual con estos.
const PARAMETROS: DefinicionParametros<keyof ParametrosVerificacion> = definirParametros({
  distanciaExifMaxM: { clave: 'verificacion.distancia_exif_max_m', valor: 100, valido: noNegativo },
  hammingDuplicadoMax: { clave: 'verificacion.hamming_duplicado_max', valor: 6, valido: bitsDelHash },
  diasFotoAntigua: { clave: 'verificacion.dias_foto_antigua', valor: 7, valido: noNegativo },
});

/** Los parámetros verificacion.* de parametro_sistema. */
export function leerParametros(): Promise<ParametrosVerificacion> {
  return leerParametrosNumericos(PARAMETROS);
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
export const DEL_ORGANISMO = Prisma.sql`
  FROM reporte r
  LEFT JOIN incidente propio ON propio.id = r.incidente_id
  LEFT JOIN incidente i ON i.id = coalesce(propio.incidente_principal_id, propio.id)
  JOIN categoria c ON c.id = coalesce(i.categoria_id, r.categoria_id)
  JOIN area a ON a.id = coalesce(i.area_id, c.area_id)`;

// Un pendiente de un incidente resuelto o desestimado ya no se revisa (409 INCIDENTE_CERRADO en resultado.ts):
// no se lista para revisar ni entra en la cola de la IA.
const INCIDENTE_ABIERTO = Prisma.sql`(i.id IS NULL OR i.estado NOT IN ('RESUELTO', 'DESESTIMADO'))`;

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
  /** El incidente propio del reporte: distinto de incidenteId si se unió a otro (F05), que es el principal. */
  propioId: number | null;
  /** Cuándo caducó o venció el principal (CADUCO_EN), o null. */
  caducadoEn: Date | null;
  reputacion: string;
  reportesConfirmados: number;
  reportesDesestimados: number;
  /**
   * La última clasificación de la IA al procesar la cola (ia/cola.ts), o null si todavía no lo procesó. Los tres
   * últimos campos son null si la IA no los informó; `datosPersonales` avisa que se ve una cara o una patente.
   */
  propuestaIa: {
    categoriaId: number;
    severidad: Severidad;
    explicacion: string | null;
    creadoEn: string;
    esProblemaViaPublica: boolean | null;
    mismoProblema: boolean | null;
    datosPersonales: boolean | null;
  } | null;
  estadoVerificacion: EstadoVerificacion;
  /** Cuándo lo publicó la IA al procesar la cola, o null si no fue ella. */
  publicadoPorIaEn: Date | null;
  /** Si la IA lo marcó para desestimar y espera que un operador lo confirme (MARCADO_PARA_DESESTIMAR). */
  marcadoParaDesestimar: boolean;
}

export interface FiltrosReportes {
  estado?: EstadoVerificacion;
  categoriaId?: number;
  /** Los pendientes se revisan del más viejo al más nuevo; el listado general muestra primero lo último. */
  orden: 'viejos' | 'nuevos';
  limite: number;
  soloIncidentesAbiertos?: boolean;
  /** true: solo los marcados para desestimar; false: sin ellos. Sin el filtro, todos. */
  marcados?: boolean;
}

/**
 * Lo que la IA necesita de cada pendiente del organismo que todavía no miró: qué eligió el vecino, su foto, los
 * controles automáticos y si aceptó la sugerencia de la IA al cargarlo. Del más viejo al más nuevo. La foto de
 * referencia se busca recién al procesar cada uno (buscarReferencia).
 *
 * Un reporte que la IA ya miró (tiene un paso CLASIFICADO) no vuelve a entrar: lo que queda es de una persona, y
 * volver a consultar costaría lo mismo para la misma respuesta. Si la consulta falló, sí vuelve a entrar.
 */
export function pendientesParaIa(organismoId: number) {
  return prisma.$queryRaw<
    {
      id: number;
      categoriaId: number;
      severidad: Severidad;
      rutaArchivo: string | null;
      senales: { tipo: TipoSenal; valor: number }[];
      sugerenciaAceptada: boolean;
    }[]
  >`
    SELECT r.id, r.categoria_id AS "categoriaId", r.severidad_declarada::text AS severidad,
           (SELECT f.ruta_archivo FROM fotografia f WHERE f.reporte_id = r.id ORDER BY f.id LIMIT 1) AS "rutaArchivo",
           (SELECT coalesce(json_agg(json_build_object('tipo', s.tipo, 'valor', s.valor::float8) ORDER BY s.id), '[]')
            FROM senal_verificacion s WHERE s.reporte_id = r.id) AS senales,
           coalesce(r.sugerencia_aceptada, false) AS "sugerenciaAceptada"
    ${DEL_ORGANISMO}
    WHERE r.estado_verificacion = 'PENDIENTE_REVISION'
      AND r.eliminado_en IS NULL
      AND a.organismo_id = ${organismoId}
      AND ${INCIDENTE_ABIERTO}
      AND NOT EXISTS (SELECT 1 FROM evento_verificacion_ia e
                      WHERE e.reporte_id = r.id AND e.estado = 'CLASIFICADO')
    ORDER BY r.registrado_en, r.id`;
}

/**
 * La foto de referencia de un pendiente: la de un reporte ya verificado del mismo incidente (el principal, con sus
 * unidos). Si la IA dice que muestran el mismo problema, el lugar queda corroborado aunque la foto no traiga
 * ubicación. Se busca al procesar cada reporte, no al arrancar: así sirve también uno que la IA acaba de publicar
 * en el mismo procesamiento (por ejemplo, la foto con GPS del mismo bache).
 */
export async function buscarReferencia(id: number) {
  const [fila] = await prisma.$queryRaw<{ reporteId: number; rutaArchivo: string }[]>`
    SELECT r2.id AS "reporteId", f.ruta_archivo AS "rutaArchivo"
    FROM reporte r
    JOIN incidente propio ON propio.id = r.incidente_id
    JOIN incidente r2_incidente ON coalesce(r2_incidente.incidente_principal_id, r2_incidente.id)
                                   = coalesce(propio.incidente_principal_id, propio.id)
    JOIN reporte r2 ON r2.incidente_id = r2_incidente.id
    JOIN fotografia f ON f.reporte_id = r2.id
    WHERE r.id = ${id}
      AND r2.id <> r.id
      AND r2.estado_verificacion = 'VERIFICADO'
      AND r2.eliminado_en IS NULL
    ORDER BY r2.registrado_en, r2.id, f.id
    LIMIT 1`;
  return fila ?? null;
}

/** En qué quedó el reporte y si su incidente se cerró: la cola lo mira antes de pagar la clasificación. */
export async function estadoEnCola(id: number) {
  const [fila] = await prisma.$queryRaw<{ estado: EstadoVerificacion; incidenteCerrado: boolean }[]>`
    SELECT r.estado_verificacion::text AS estado, NOT ${INCIDENTE_ABIERTO} AS "incidenteCerrado"
    FROM reporte r
    LEFT JOIN incidente propio ON propio.id = r.incidente_id
    LEFT JOIN incidente i ON i.id = coalesce(propio.incidente_principal_id, propio.id)
    WHERE r.id = ${id}`;
  if (!fila) throw new Error(`No existe el reporte ${id}`);
  return fila;
}

/**
 * Los reportes que esperan revisión en los incidentes abiertos del organismo, del más viejo al más nuevo. Los
 * marcados para desestimar van aparte (listarMarcados).
 */
export function listarPendientes(organismoId: number) {
  return listarDelOrganismo(organismoId, {
    estado: 'PENDIENTE_REVISION',
    orden: 'viejos',
    limite: 1000,
    soloIncidentesAbiertos: true,
    marcados: false,
  });
}

/** Los desestimados pendientes: los que la IA marcó para desestimar en los incidentes abiertos del organismo. */
export function listarMarcados(organismoId: number) {
  return listarDelOrganismo(organismoId, {
    estado: 'PENDIENTE_REVISION',
    orden: 'viejos',
    limite: 1000,
    soloIncidentesAbiertos: true,
    marcados: true,
  });
}

/** Si el reporte sigue marcado para desestimar: entre que el operador vio la lista y confirmó, pudo cambiar. */
export async function estaMarcado(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<{ marcado: boolean }[]>`
    SELECT ${MARCADO_PARA_DESESTIMAR()} AS marcado FROM reporte r WHERE r.id = ${id}`;
  return fila?.marcado ?? false;
}

/** Los reportes de los incidentes del organismo, con todo lo que hace falta para revisarlos o consultarlos. */
export function listarDelOrganismo(organismoId: number, filtros: FiltrosReportes) {
  // Uno que su autor eliminó (#150) ya no se revisa ni se lista.
  const condiciones = [Prisma.sql`a.organismo_id = ${organismoId}`, Prisma.sql`r.eliminado_en IS NULL`];
  if (filtros.estado) {
    condiciones.push(Prisma.sql`r.estado_verificacion = ${filtros.estado}::estado_verificacion`);
  }
  if (filtros.categoriaId) condiciones.push(Prisma.sql`r.categoria_id = ${filtros.categoriaId}`);
  if (filtros.soloIncidentesAbiertos) condiciones.push(INCIDENTE_ABIERTO);
  if (filtros.marcados !== undefined) {
    condiciones.push(
      filtros.marcados ? MARCADO_PARA_DESESTIMAR() : Prisma.sql`NOT ${MARCADO_PARA_DESESTIMAR()}`,
    );
  }
  const orden =
    filtros.orden === 'viejos'
      ? Prisma.sql`r.registrado_en, r.id`
      : Prisma.sql`r.registrado_en DESC, r.id DESC`;
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
           propio.id AS "propioId", ${CADUCO_EN} AS "caducadoEn",
           u.reputacion::text AS reputacion, u.reportes_confirmados AS "reportesConfirmados",
           u.reportes_desestimados AS "reportesDesestimados",
           (SELECT json_build_object(
                     'categoriaId', (ri.salida->>'categoriaId')::int,
                     'severidad', ri.salida->>'severidad',
                     'explicacion', ri.salida->>'explicacion',
                     'creadoEn', e.creado_en,
                     'esProblemaViaPublica', (ri.salida->>'esProblemaViaPublica')::boolean,
                     'mismoProblema', (ri.salida->>'mismoProblema')::boolean,
                     'datosPersonales', (ri.salida->>'datosPersonales')::boolean)
            FROM evento_verificacion_ia e
            JOIN registro_ia ri ON ri.id = e.registro_ia_id
            WHERE e.reporte_id = r.id AND e.estado = 'CLASIFICADO'
            ORDER BY e.id DESC
            LIMIT 1) AS "propuestaIa",
           r.estado_verificacion::text AS "estadoVerificacion",
           (SELECT min(e.creado_en) FROM evento_verificacion_ia e
            WHERE e.reporte_id = r.id AND e.estado = 'PUBLICADO') AS "publicadoPorIaEn",
           ${MARCADO_PARA_DESESTIMAR()} AS "marcadoParaDesestimar"
    ${DEL_ORGANISMO}
    JOIN categoria rc ON rc.id = r.categoria_id
    JOIN usuario u ON u.id = r.usuario_id
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY ${orden}
    LIMIT ${filtros.limite}`;
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

/**
 * Del reporte, lo que hace falta para aplicar su resultado: su vecino, su confianza, el incidente que manda y
 * el suyo (distinto si se unió a otro).
 */
export async function leerReporte(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<
    { usuarioId: number; nivelConfianza: number; incidenteId: number | null; propioId: number | null }[]
  >`
    SELECT r.usuario_id AS "usuarioId", r.nivel_confianza AS "nivelConfianza", i.id AS "incidenteId",
           propio.id AS "propioId"
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

/**
 * Bloquea los incidentes hasta que termine la transacción, en orden de id como la unión: una revisión y una
 * unión de los mismos incidentes no se trancan entre sí.
 */
export async function bloquearIncidentes(tx: Tx, ids: number[]) {
  await tx.$queryRaw`
    SELECT id FROM incidente WHERE id IN (${Prisma.join([...new Set(ids)])}) ORDER BY id FOR UPDATE`;
}

/**
 * Un reporte desestimado deja de contar en `cantidad_reportes` (decisión del 21/10): se le resta a su
 * incidente y, si se unió a otro, también al principal, que sumaba los reportes del duplicado.
 */
export function restarReporte(tx: Tx, ids: number[]) {
  return tx.incidente.updateMany({
    where: { id: { in: [...new Set(ids)] } },
    data: { cantidadReportes: { decrement: 1 } },
  });
}

/** El estado del incidente, bloqueado hasta que termine la transacción. */
export async function bloquearIncidente(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<{ estado: EstadoIncidente }[]>`
    SELECT estado::text AS estado FROM incidente WHERE id = ${id} FOR UPDATE`;
  return fila!.estado;
}

export function actualizarIncidente(
  tx: Tx,
  id: number,
  datos: { estado?: EstadoIncidente; severidad?: Severidad },
) {
  return tx.incidente.update({ where: { id }, data: { ...datos, actualizadoEn: new Date() } });
}

/**
 * El nombre del área que atiende el reporte: la del incidente que manda (la derivada o, si no, la de su
 * categoría) o, si el reporte no tiene incidente, la de su categoría.
 */
export async function areaDelReporte(tx: Tx, reporteId: number) {
  const [fila] = await tx.$queryRaw<{ nombre: string }[]>`
    SELECT a.nombre ${DEL_ORGANISMO}
    WHERE r.id = ${reporteId}`;
  return fila?.nombre ?? null;
}

export function comentarReporte(tx: Tx, comentario: { usuarioId: number; reporteId: number; texto: string }) {
  return tx.comentario.create({ data: comentario });
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
