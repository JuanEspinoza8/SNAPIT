import { prisma } from '../compartido/prisma.js';
import { correrPrioridadDiaria } from './prioridadDiaria.js';

// El recálculo diario, una sola vez y sin esperar a las 03:00. Desde la PC: npm run tarea:prioridad.
// En Docker: docker compose exec server node dist/tareas/recalcularPrioridad.js
try {
  const resumen = await correrPrioridadDiaria();
  if (!resumen || resumen.fallidos > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
