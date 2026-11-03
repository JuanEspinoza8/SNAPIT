import { PrismaClient } from '@prisma/client';
import { revincularIncidentes } from '../src/modulos/red/repositorio.js';
import { describirVinculos } from '../src/modulos/red/servicio.js';

// Recalcula qué tramos obstruye cada incidente. importar:red ya lo hace solo; esto hace falta después de
// cambiar ruteo.radio_obstruccion_m o una zona piloto, o para los incidentes que se cargaron antes (#103).
// El .env lo lee config/env.ts al cargar los parámetros, como en el servidor.
const prisma = new PrismaClient();

try {
  console.log(describirVinculos(await revincularIncidentes(prisma)));
} catch (error) {
  console.error('No se pudieron vincular los incidentes:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
