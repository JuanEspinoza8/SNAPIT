import { randomUUID } from 'node:crypto';
import type { RolUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app.js';
import { almacenFotos } from '../src/compartido/almacenFotos.js';
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

/**
 * Borra los reportes de estos usuarios, sus fotos (filas y archivos) y los incidentes que abrieron.
 * La base de tests se reutiliza entre corridas: así no se acumulan incidentes en Neuquén.
 */
export async function borrarReportesDe(usuarioIds: number[]) {
  const reportes = await prisma.reporte.findMany({
    where: { usuarioId: { in: usuarioIds } },
    select: { incidenteId: true, fotografias: { select: { rutaArchivo: true } } },
  });
  await Promise.all(reportes.flatMap((r) => r.fotografias.map((f) => almacenFotos.borrar(f.rutaArchivo))));
  await prisma.reporte.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
  const incidentes = reportes.flatMap((r) => (r.incidenteId === null ? [] : [r.incidenteId]));
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
}
