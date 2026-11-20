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
