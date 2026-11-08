import { type Plataforma, Prisma, type TipoNotificacion } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { REPORTES_VISIBLES_DEL_INCIDENTE } from '../incidentes/repositorio.js';
import type { Destinatario } from './calculo.js';
import type { DatosZona } from './esquemas.js';

// --- Avisos y dispositivos (#113) ---

/**
 * Lo que decide si el usuario recibe un aviso de ese incidente: su baja, el interruptor general y su
 * preferencia para la categoría del incidente. Sin incidente, la categoría no cuenta. Undefined si no existe.
 */
export async function buscarDestinatario(usuarioId: number, incidenteId: number | null) {
  const [destinatario] = await prisma.$queryRaw<Destinatario[]>`
    SELECT u.eliminado_en IS NOT NULL AS "dadoDeBaja",
           u.notificaciones_habilitadas AS "avisosHabilitados",
           coalesce(p.habilitada, true) AS "categoriaHabilitada"
    FROM usuario u
    LEFT JOIN incidente i ON i.id = ${incidenteId}::int
    LEFT JOIN preferencia_notificacion p ON p.usuario_id = u.id AND p.categoria_id = i.categoria_id
    WHERE u.id = ${usuarioId}`;
  return destinatario;
}

export function crearNotificacion(datos: {
  usuarioId: number;
  tipo: TipoNotificacion;
  incidenteId: number | null;
  titulo: string;
  cuerpo: string;
}) {
  return prisma.notificacion.create({ data: datos });
}

export function marcarEnviada(id: number, enviadaEn: Date) {
  return prisma.notificacion.update({ where: { id }, data: { enviadaEn } });
}

export function listarTokensActivos(usuarioId: number) {
  return prisma.dispositivo.findMany({
    where: { usuarioId, activo: true },
    select: { tokenPush: true },
    orderBy: { id: 'asc' },
  });
}

export function desactivarDispositivos(usuarioId: number, tokens: string[]) {
  return prisma.dispositivo.updateMany({
    where: { usuarioId, tokenPush: { in: tokens } },
    data: { activo: false },
  });
}

/**
 * El token queda de este usuario y activo. Si ya estaba (otra cuenta en el mismo celular, o el mismo usuario que
 * vuelve a ingresar), se reasigna en vez de duplicarse. token_push no es único en la base: el bloqueo por token
 * hace que dos registros simultáneos del mismo celular no creen dos filas.
 */
export function registrarDispositivo(usuarioId: number, tokenPush: string, plataforma: Plataforma) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dispositivo'), hashtext(${tokenPush}))`;
    const datos = { usuarioId, plataforma, activo: true, ultimoUsoEn: new Date() };
    const { count } = await tx.dispositivo.updateMany({ where: { tokenPush }, data: datos });
    if (count === 0) await tx.dispositivo.create({ data: { ...datos, tokenPush } });
  });
}

export const MAXIMO_NOTIFICACIONES = 100;

export function listarNotificaciones(usuarioId: number) {
  return prisma.notificacion.findMany({
    where: { usuarioId },
    select: {
      id: true,
      tipo: true,
      incidenteId: true,
      titulo: true,
      cuerpo: true,
      creadoEn: true,
      enviadaEn: true,
      leidaEn: true,
    },
    orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
    take: MAXIMO_NOTIFICACIONES,
  });
}

/** Marca la hora de lectura solo la primera vez. Devuelve false si el aviso no existe o es de otro usuario. */
export async function marcarLeida(usuarioId: number, id: number, ahora: Date) {
  const aviso = await prisma.notificacion.findFirst({ where: { id, usuarioId }, select: { leidaEn: true } });
  if (!aviso) return false;
  if (!aviso.leidaEn) {
    await prisma.notificacion.updateMany({ where: { id, leidaEn: null }, data: { leidaEn: ahora } });
  }
  return true;
}

// --- Seguimiento de incidentes (#114) ---

/**
 * Los seguimientos que cuentan para el incidente principal: los suyos y los de los incidentes que se le unieron
 * (un vecino que seguía el duplicado sigue el problema, regla 5 del modelo).
 */
const seguimientosDe = (usuarioId: number, principalId: number) => ({
  usuarioId,
  OR: [{ incidenteId: principalId }, { incidente: { incidentePrincipalId: principalId } }],
});

export async function seguir(usuarioId: number, incidenteId: number) {
  // Seguir dos veces no falla: la clave única (usuario, incidente) descarta la segunda.
  await prisma.seguimientoIncidente.createMany({ data: [{ usuarioId, incidenteId }], skipDuplicates: true });
}

export async function dejarDeSeguir(usuarioId: number, principalId: number) {
  await prisma.seguimientoIncidente.deleteMany({ where: seguimientosDe(usuarioId, principalId) });
}

export async function estaSiguiendo(usuarioId: number, principalId: number) {
  return (await prisma.seguimientoIncidente.count({ where: seguimientosDe(usuarioId, principalId) })) > 0;
}

// --- Zonas habituales (#114) ---
// El centro es una columna de PostGIS que Prisma no maneja: se lee y se escribe en SQL.

export interface Zona {
  id: number;
  nombre: string;
  lat: number;
  lon: number;
  radioMetros: number;
  activa: boolean;
  creadoEn: Date;
}

const COLUMNAS_ZONA = Prisma.sql`
  id, nombre,
  ST_Y(centro::geometry) AS lat,
  ST_X(centro::geometry) AS lon,
  radio_metros AS "radioMetros", activa, creado_en AS "creadoEn"`;

// ST_MakePoint recibe primero la longitud y después la latitud.
const centro = ({ lat, lon }: { lat: number; lon: number }) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;

export function listarZonas(usuarioId: number) {
  return prisma.$queryRaw<Zona[]>`
    SELECT ${COLUMNAS_ZONA} FROM zona_habitual
    WHERE usuario_id = ${usuarioId}
    ORDER BY creado_en, id`;
}

export async function crearZona(usuarioId: number, datos: DatosZona) {
  const [zona] = await prisma.$queryRaw<Zona[]>`
    INSERT INTO zona_habitual (usuario_id, nombre, centro, radio_metros, activa)
    VALUES (${usuarioId}, ${datos.nombre}, ${centro(datos)}, ${datos.radioMetros}, ${datos.activa})
    RETURNING ${COLUMNAS_ZONA}`;
  return zona!;
}

/** Undefined si la zona no existe o es de otro vecino: para él, las dos cosas son lo mismo. */
export async function actualizarZona(usuarioId: number, id: number, datos: DatosZona) {
  const [zona] = await prisma.$queryRaw<Zona[]>`
    UPDATE zona_habitual
    SET nombre = ${datos.nombre}, centro = ${centro(datos)}, radio_metros = ${datos.radioMetros},
        activa = ${datos.activa}
    WHERE id = ${id} AND usuario_id = ${usuarioId}
    RETURNING ${COLUMNAS_ZONA}`;
  return zona;
}

/** Borra la fila: es configuración del vecino y nada apunta a ella (decisión del 04/11). */
export async function borrarZona(usuarioId: number, id: number) {
  const { count } = await prisma.zonaHabitual.deleteMany({ where: { id, usuarioId } });
  return count > 0;
}

// --- A quién avisar (#115) ---

/** De qué se trata el incidente, para el texto del aviso. Undefined si no existe. */
export async function buscarIncidente(id: number) {
  const [fila] = await prisma.$queryRaw<{ categoria: string; direccion: string | null }[]>`
    SELECT c.nombre AS categoria, i.direccion
    FROM incidente i JOIN categoria c ON c.id = i.categoria_id
    WHERE i.id = ${id}`;
  return fila;
}

/** Quienes reportaron el incidente o uno de los unidos a él, sin los reportes desestimados ni eliminados. */
export async function quienesReportaron(id: number) {
  const filas = await prisma.$queryRaw<{ usuarioId: number }[]>`
    SELECT DISTINCT r.usuario_id AS "usuarioId" ${REPORTES_VISIBLES_DEL_INCIDENTE(id)}`;
  return filas.map((fila) => fila.usuarioId);
}

/** Quienes siguen el incidente o uno de los unidos a él (regla 5 del modelo). */
export async function quienesSiguen(id: number) {
  const filas = await prisma.$queryRaw<{ usuarioId: number }[]>`
    SELECT DISTINCT s.usuario_id AS "usuarioId"
    FROM seguimiento_incidente s
    JOIN incidente i ON i.id = s.incidente_id
    WHERE i.id = ${id} OR i.incidente_principal_id = ${id}`;
  return filas.map((fila) => fila.usuarioId);
}

/** El autor del reporte y su categoría. Undefined si no existe. */
export async function buscarReporte(id: number) {
  const [fila] = await prisma.$queryRaw<{ usuarioId: number; categoria: string }[]>`
    SELECT r.usuario_id AS "usuarioId", c.nombre AS categoria
    FROM reporte r JOIN categoria c ON c.id = r.categoria_id
    WHERE r.id = ${id}`;
  return fila;
}

/**
 * Los vecinos con una zona habitual activa que contiene el incidente, salvo `excepto`. Si el incidente cae en
 * varias zonas del mismo vecino, una sola (la más vieja), así recibe un solo aviso.
 */
export function zonasQueContienen(incidenteId: number, excepto: number) {
  return prisma.$queryRaw<{ usuarioId: number; zona: string }[]>`
    SELECT DISTINCT ON (z.usuario_id) z.usuario_id AS "usuarioId", z.nombre AS zona
    FROM zona_habitual z
    JOIN incidente i ON i.id = ${incidenteId}
    WHERE z.activa AND z.usuario_id <> ${excepto}
      AND ST_DWithin(z.centro, i.ubicacion, z.radio_metros)
    ORDER BY z.usuario_id, z.creado_en, z.id`;
}
