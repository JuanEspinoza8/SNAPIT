import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

/**
 * El usuario con el que SnapIt firma sus comentarios, por ejemplo el agradecimiento al publicar un reporte. Es una
 * fila más de `usuario` (el modelo no tiene otra forma de ser autor), pero nadie inicia sesión con él: su clave es
 * aleatoria y no se guarda en ningún lado. Es ADMINISTRADOR sin organismo, así no cuenta como vecino ni gestiona nada.
 */
export const USUARIO_SISTEMA = { email: 'sistema@snapit.app', nombre: 'SnapIt' } as const;

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

/** Crea el usuario de SnapIt si no existe, o lo deja como tiene que estar. Devuelve su id. */
export async function asegurarUsuarioSistema(cliente: Prisma.TransactionClient | PrismaClient = prisma) {
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
