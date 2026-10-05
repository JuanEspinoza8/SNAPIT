import type { Prisma, TipoToken } from '@prisma/client';
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

export function crearRecuperacionClave(usuarioId: number, tokenHash: string, expiraEn: Date) {
  return prisma.tokenAcceso.create({ data: { usuarioId, tipo: 'RECUPERACION_CLAVE', tokenHash, expiraEn } });
}

export function buscarToken(tokenHash: string, tipo: TipoToken) {
  return prisma.tokenAcceso.findFirst({ where: { tokenHash, tipo }, include: { usuario: true } });
}

/**
 * Marca el token como usado solo si todavía no lo estaba. Devuelve false si otra petición lo usó antes:
 * así dos peticiones simultáneas con el mismo token no pueden ganar las dos.
 */
export async function consumirToken(id: number, ahora: Date, tx: Prisma.TransactionClient = prisma) {
  const { count } = await tx.tokenAcceso.updateMany({
    where: { id, usadoEn: null },
    data: { usadoEn: ahora },
  });
  return count === 1;
}

/** Marca como usados todos los tokens pendientes del usuario: sesiones abiertas y links de correos. */
export function anularTokensPendientes(usuarioId: number, ahora: Date, tx: Prisma.TransactionClient) {
  return tx.tokenAcceso.updateMany({ where: { usuarioId, usadoEn: null }, data: { usadoEn: ahora } });
}

/** Completa email_verificado_en. Si ya estaba confirmado, conserva la fecha original. */
export function marcarCorreoConfirmado(usuarioId: number, ahora: Date, tx: Prisma.TransactionClient) {
  return tx.usuario.updateMany({
    where: { id: usuarioId, emailVerificadoEn: null },
    data: { emailVerificadoEn: ahora, actualizadoEn: ahora },
  });
}

export function cambiarClave(
  usuarioId: number,
  passwordHash: string,
  ahora: Date,
  tx: Prisma.TransactionClient,
) {
  return tx.usuario.update({ where: { id: usuarioId }, data: { passwordHash, actualizadoEn: ahora } });
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
