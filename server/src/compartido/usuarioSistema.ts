import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

/**
 * El usuario con el que SnapIt firma sus comentarios, por ejemplo el agradecimiento al publicar un reporte. Es una
 * fila más de `usuario` (el modelo no tiene otra forma de ser autor), pero nadie inicia sesión con él: su clave es
 * aleatoria y no se guarda en ningún lado. Es ADMINISTRADOR sin organismo, así no cuenta como vecino ni gestiona nada.
 */
export const USUARIO_SISTEMA = { email: 'sistema@snapit.invalid', nombre: 'SnapIt' } as const;

// El correo que tenía antes. snapit.app es un dominio que existe y recibe correo: quien lo maneje podría pedir la
// clave de un administrador. .invalid está reservado y no llega a ningún lado.
const EMAIL_ANTERIOR = 'sistema@snapit.app';

/** Si el correo es el de SnapIt (el de ahora o el anterior): con él no se ingresa ni se cambia la clave. */
export function esCorreoDelSistema(email: string) {
  return email === USUARIO_SISTEMA.email || email === EMAIL_ANTERIOR;
}

let idGuardado: number | null = null;

/**
 * El id del usuario de SnapIt, o null si todavía no existe (la semilla lo crea). Una vez encontrado se guarda: no
 * cambia mientras corre el servidor.
 */
export async function idUsuarioSistema(cliente: Prisma.TransactionClient | PrismaClient = prisma) {
  if (idGuardado !== null) return idGuardado;
  const usuario = await cliente.usuario.findUnique({
    where: { email: USUARIO_SISTEMA.email },
    select: { id: true },
  });
  if (usuario) idGuardado = usuario.id;
  return usuario?.id ?? null;
}

/**
 * Crea el usuario de SnapIt si no existe, o lo deja como tiene que estar. Devuelve su id. En una base que lo tiene
 * con el correo anterior, se lo cambia: sigue siendo el mismo usuario, con sus comentarios.
 */
export async function asegurarUsuarioSistema(cliente: Prisma.TransactionClient | PrismaClient = prisma) {
  const anterior = await cliente.usuario.findUnique({
    where: { email: EMAIL_ANTERIOR },
    select: { id: true },
  });
  if (anterior) {
    await cliente.usuario.update({ where: { id: anterior.id }, data: { email: USUARIO_SISTEMA.email } });
  }
  const datos = {
    nombre: USUARIO_SISTEMA.nombre,
    rol: 'ADMINISTRADOR' as const,
    organismoId: null,
    areaId: null,
    eliminadoEn: null,
  };
  const { id } = await cliente.usuario.upsert({
    where: { email: USUARIO_SISTEMA.email },
    create: {
      email: USUARIO_SISTEMA.email,
      // Una clave que nadie conoce: con este usuario no se puede iniciar sesión.
      passwordHash: await bcrypt.hash(randomUUID(), 10),
      emailVerificadoEn: new Date(),
      ...datos,
    },
    update: datos,
    select: { id: true },
  });
  return id;
}
