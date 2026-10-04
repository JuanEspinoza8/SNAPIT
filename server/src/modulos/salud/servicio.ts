import { prisma } from '../../compartido/prisma.js';
import { logger } from '../../config/logger.js';

export async function consultarSalud() {
  let baseDeDatos: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.warn({ err }, 'La base de datos no responde');
    baseDeDatos = 'error';
  }
  return { estado: 'ok', baseDeDatos };
}
