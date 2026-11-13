import { prisma } from '../compartido/prisma.js';
import { correrCaducidadDiaria } from './caducidadDiaria.js';

// La caducidad diaria, una sola vez y sin esperar a las 03:00. Desde la PC: npm run tarea:caducidad.
// En Docker: docker compose exec server node dist/tareas/caducarVencidos.js
try {
  const resumen = await correrCaducidadDiaria();
  if (!resumen || resumen.fallidos > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
