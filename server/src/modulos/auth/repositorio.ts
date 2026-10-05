import type { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';

export function buscarUsuarioPorEmail(email: string) {
  return prisma.usuario.findUnique({ where: { email } });
}

export function buscarUsuarioPorId(id: number) {
  return prisma.usuario.findUnique({ where: { id } });
}

/** Crea el vecino y su token de verificación en una sola transacción. */
export function crearVecinoConVerificacion(
  datos: { email: string; passwordHash: string; nombre: string },
  verificacion: { tokenHash: string; expiraEn: Date },
) {
  return prisma.usuario.create({
    data: {
      ...datos,
      rol: 'VECINO',
      tokenAccesos: { create: { tipo: 'VERIFICACION_EMAIL', ...verificacion } },
    },
  });
}

export function crearSesion(
  usuarioId: number,
  tokenHash: string,
  expiraEn: Date,
  tx: Prisma.TransactionClient = prisma,
) {
  return tx.tokenAcceso.create({ data: { usuarioId, tipo: 'SESION', tokenHash, expiraEn } });
}

export function buscarSesion(tokenHash: string) {
  return prisma.tokenAcceso.findFirst({ where: { tokenHash, tipo: 'SESION' }, include: { usuario: true } });
}

/**
 * Marca la sesión como usada solo si todavía no lo estaba. Devuelve false si otra petición la usó antes:
 * así dos renovaciones simultáneas con el mismo token no pueden ganar las dos.
 */
export async function consumirSesion(id: number, ahora: Date, tx: Prisma.TransactionClient = prisma) {
  const { count } = await tx.tokenAcceso.updateMany({
    where: { id, usadoEn: null },
    data: { usadoEn: ahora },
  });
  return count === 1;
}

export function cerrarSesionPorHash(tokenHash: string, ahora: Date) {
  return prisma.tokenAcceso.updateMany({
    where: { tokenHash, tipo: 'SESION', usadoEn: null },
    data: { usadoEn: ahora },
  });
}

export function transaccion<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(fn);
}
