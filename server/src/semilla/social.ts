import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { cargarSocial } from './cargarSocial.js';
import { CLAVE_USUARIOS_PRUEBA, USUARIOS_PRUEBA } from './datos.js';

/** Más vecinos de ejemplo, además de los tres de la semilla: con tres solos, el feed se ve vacío. */
const VECINOS_SOCIAL = [
  { email: 'vecino4@snapit.test', nombre: 'Diego Vecino' },
  { email: 'vecino5@snapit.test', nombre: 'Elena Vecina' },
  { email: 'vecino6@snapit.test', nombre: 'Facundo Vecino' },
  { email: 'vecino7@snapit.test', nombre: 'Gabriela Vecina' },
  { email: 'vecino8@snapit.test', nombre: 'Hernán Vecino' },
];

// Likes y comentarios de ejemplo sobre los incidentes que ya hay, para ver el feed social en desarrollo.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const prisma = new PrismaClient();

try {
  // Son datos inventados: en producción se mezclarían con los de los vecinos reales.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Con NODE_ENV=production no se cargan likes ni comentarios de ejemplo');
  }
  const deLaSemilla = USUARIOS_PRUEBA.filter((u) => u.rol === 'VECINO').map((u) => u.email);
  if ((await prisma.usuario.count({ where: { email: { in: deLaSemilla } } })) === 0) {
    throw new Error('No están los usuarios de prueba: corré primero npm run semilla');
  }
  // Confirmados y con la misma clave que los de la semilla, para poder entrar con cualquiera.
  const passwordHash = await bcrypt.hash(CLAVE_USUARIOS_PRUEBA, 10);
  for (const vecino of VECINOS_SOCIAL) {
    await prisma.usuario.upsert({
      where: { email: vecino.email },
      update: {},
      create: { ...vecino, rol: 'VECINO', passwordHash, emailVerificadoEn: new Date() },
    });
  }
  // Likes y comentarios, solo de vecinos: un «se me rompió la rueda» firmado por el municipio no tiene sentido.
  const usuarios = await prisma.usuario.findMany({
    where: { email: { in: [...deLaSemilla, ...VECINOS_SOCIAL.map((v) => v.email)] }, eliminadoEn: null },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const totales = await cargarSocial(prisma, { usuarioIds: usuarios.map((u) => u.id) });
  console.log('Likes y comentarios de ejemplo cargados:', totales);
  console.log(
    `Vecinos de ejemplo (clave "${CLAVE_USUARIOS_PRUEBA}"): ${VECINOS_SOCIAL.map((v) => v.email).join(', ')}`,
  );
} catch (error) {
  console.error('No se pudo cargar la semilla social:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
