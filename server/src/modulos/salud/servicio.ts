import { prisma } from '../../compartido/prisma.js';

export async function consultarSalud() {
  let baseDeDatos: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    baseDeDatos = 'error';
  }
  return { estado: 'ok', baseDeDatos };
}
