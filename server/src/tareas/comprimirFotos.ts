import { prisma } from '../compartido/prisma.js';
import { comprimirFotosGuardadas } from './compresionFotos.js';

// Pasa a WebP las fotos guardadas antes de que se guardaran así. Desde la PC: npm run fotos:comprimir
// (con -- --probar, solo cuenta cuánto se ahorraría). En Docker: docker compose exec server node dist/tareas/comprimirFotos.js
const probar = process.argv.includes('--probar');
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

try {
  const r = await comprimirFotosGuardadas({ probar });
  console.log(
    `${probar ? 'Prueba: ' : ''}${r.fotos} fotos para pasar a WebP. ` +
      `${probar ? 'Se podrían comprimir' : 'Comprimidas'}: ${probar ? r.fotos - r.fallidas : r.comprimidas}. ` +
      `Fallidas: ${r.fallidas}. De ${mb(r.bytesAntes)} a ${mb(r.bytesDespues)}.`,
  );
  if (r.fallidas > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
