import { randomUUID } from 'node:crypto';
import type { RolUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';

export const CLAVE = 'clave-de-prueba-1';

// Cada test usa un correo distinto, así pueden correr en paralelo sobre la misma base.
export const correoNuevo = () => `prueba-${randomUUID()}@snapit.test`;

export async function crearUsuario(
  opciones: { rol?: RolUsuario; confirmado?: boolean; dadoDeBaja?: boolean } = {},
) {
  const { rol = 'VECINO', confirmado = true, dadoDeBaja = false } = opciones;
  return prisma.usuario.create({
    data: {
      email: correoNuevo(),
      nombre: 'Persona de prueba',
      passwordHash: await bcrypt.hash(CLAVE, 4),
      rol,
      emailVerificadoEn: confirmado ? new Date() : null,
      eliminadoEn: dadoDeBaja ? new Date() : null,
    },
  });
}

/** Token de acceso de un usuario nuevo con ese rol. */
export async function tokenDe(rol: RolUsuario) {
  return crearTokenAcceso(await crearUsuario({ rol }));
}

export async function ingresar(email: string, clave = CLAVE) {
  return request(app).post('/api/auth/ingreso').send({ email, clave });
}
