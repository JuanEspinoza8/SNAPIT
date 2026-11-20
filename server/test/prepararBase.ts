import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { asegurarUsuarioSistema } from '../src/compartido/usuarioSistema.js';

// Aplica las migraciones en la base de pruebas. Si la base no existe, Prisma la crea.
export default async function prepararBase() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'inherit',
  });

  // El usuario de SnapIt, como lo deja la semilla: así todo reporte publicado lleva su comentario en cualquier
  // test, y no depende de si otro test ya corrió la semilla en esta base.
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    await asegurarUsuarioSistema(base);
  } finally {
    await base.$disconnect();
  }
}
