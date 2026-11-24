import type { Prisma, RolUsuario } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { USUARIO_SISTEMA } from '../../compartido/usuarioSistema.js';

export function buscarOrganismo(id: number) {
  return prisma.organismo.findUnique({ where: { id } });
}

export function buscarArea(id: number) {
  return prisma.area.findUnique({ where: { id } });
}

export function crearUsuario(datos: {
  email: string;
  passwordHash: string;
  nombre: string;
  rol: RolUsuario;
  organismoId: number | null;
  areaId: number | null;
  emailVerificadoEn: Date;
}) {
  return prisma.usuario.create({ data: datos });
}

/** Organismos activos con sus áreas activas: lo que se puede elegir al dar de alta un operador. */
export function listarOrganismosActivos() {
  return prisma.organismo.findMany({
    where: { activo: true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      nombre: true,
      areas: {
        where: { activa: true },
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        select: { id: true, nombre: true },
      },
    },
  });
}

/** Usuarios que no están dados de baja, de cualquier rol. SnapIt no: no es una persona y no se administra. */
export function listarUsuarios() {
  return prisma.usuario.findMany({
    where: { eliminadoEn: null, email: { not: USUARIO_SISTEMA.email } },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
  });
}

export type Tx = Prisma.TransactionClient;

export function transaccion<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(fn);
}

/** El usuario, bloqueado hasta que termine la transacción: dos cambios a la vez no se pisan. */
export async function bloquearUsuario(tx: Tx, id: number) {
  const filas = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM usuario WHERE id = ${id} FOR UPDATE`;
  return filas.length > 0 ? tx.usuario.findUnique({ where: { id } }) : null;
}

/**
 * Cuántos administradores activos quedan sin contar a [excepto]. Bloquea sus filas: si dos administradores se
 * dan de baja entre sí a la vez, el segundo espera y ve que ya no queda otro.
 */
export async function otrosAdministradoresActivos(tx: Tx, excepto: number) {
  const filas = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM usuario
    WHERE rol = 'ADMINISTRADOR' AND eliminado_en IS NULL AND id <> ${excepto}
      AND email <> ${USUARIO_SISTEMA.email}
    FOR UPDATE`;
  return filas.length;
}

export function actualizarUsuario(
  tx: Tx,
  id: number,
  datos: { nombre: string; rol: RolUsuario; organismoId: number | null; areaId: number | null },
) {
  return tx.usuario.update({ where: { id }, data: { ...datos, actualizadoEn: new Date() } });
}

export function darDeBaja(tx: Tx, id: number, ahora: Date) {
  return tx.usuario.update({ where: { id }, data: { eliminadoEn: ahora, actualizadoEn: ahora } });
}

/** Cierra sus sesiones y anula sus enlaces pendientes: con otro rol o dado de baja, tiene que volver a ingresar. */
export function cerrarSesiones(tx: Tx, usuarioId: number, ahora: Date) {
  return tx.tokenAcceso.updateMany({ where: { usuarioId, usadoEn: null }, data: { usadoEn: ahora } });
}

// --- Organismos y áreas (#165) ---

/** Todos los organismos, también los inactivos, con todas sus áreas y cuántas categorías activas tiene cada una. */
export async function listarTodosLosOrganismos() {
  const organismos = await prisma.organismo.findMany({
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      activo: true,
      creadoEn: true,
      areas: {
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          activa: true,
          creadoEn: true,
          _count: { select: { categorias: { where: { activa: true } } } },
        },
      },
    },
  });
  return organismos.map(({ areas, ...organismo }) => ({
    ...organismo,
    areas: areas.map(({ _count, ...area }) => ({ ...area, categoriasActivas: _count.categorias })),
  }));
}

/**
 * Los nombres de organismo no se repiten. No hay restricción única en la base: este lock serializa las altas y
 * los cambios de nombre, para que dos a la vez no pasen los dos el control.
 */
export async function bloquearNombresDeOrganismos(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('organismo.nombre'))`;
}

/**
 * El organismo, bloqueado hasta que termine la transacción. Todo cambio a sus áreas pasa por acá: así no se da
 * de baja el organismo mientras otro activa un área suya, ni se repite un nombre de área.
 */
export async function bloquearOrganismo(tx: Tx, id: number) {
  const filas = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM organismo WHERE id = ${id} FOR UPDATE`;
  return filas.length > 0 ? tx.organismo.findUnique({ where: { id } }) : null;
}

export function organismoConNombre(tx: Tx, nombre: string, excepto?: number) {
  return tx.organismo.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(excepto ? { id: { not: excepto } } : {}) },
  });
}

export function areaConNombre(tx: Tx, organismoId: number, nombre: string, excepto?: number) {
  return tx.area.findFirst({
    where: {
      organismoId,
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(excepto ? { id: { not: excepto } } : {}),
    },
  });
}

export function areasActivas(tx: Tx, organismoId: number) {
  return tx.area.findMany({
    where: { organismoId, activa: true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    select: { id: true, nombre: true },
  });
}

export function categoriasActivas(tx: Tx, areaId: number) {
  return tx.categoria.findMany({
    where: { areaId, activa: true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    select: { id: true, nombre: true },
  });
}

const camposOrganismo = { id: true, nombre: true, descripcion: true, activo: true, creadoEn: true } as const;
const camposArea = {
  id: true,
  organismoId: true,
  nombre: true,
  descripcion: true,
  activa: true,
  creadoEn: true,
} as const;

export function crearOrganismo(tx: Tx, datos: { nombre: string; descripcion: string | null }) {
  return tx.organismo.create({ data: datos, select: camposOrganismo });
}

export function actualizarOrganismo(
  tx: Tx,
  id: number,
  datos: { nombre?: string; descripcion?: string | null; activo?: boolean },
) {
  return tx.organismo.update({ where: { id }, data: datos, select: camposOrganismo });
}

export function crearArea(
  tx: Tx,
  datos: { organismoId: number; nombre: string; descripcion: string | null },
) {
  return tx.area.create({ data: datos, select: camposArea });
}

export function buscarAreaEn(tx: Tx, id: number) {
  return tx.area.findUnique({ where: { id }, select: camposArea });
}

export function actualizarArea(
  tx: Tx,
  id: number,
  datos: { nombre?: string; descripcion?: string | null; activa?: boolean },
) {
  return tx.area.update({ where: { id }, data: datos, select: camposArea });
}
