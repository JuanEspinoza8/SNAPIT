import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Carga los reportes de la demo desde una carpeta con fotos y su demo.json (ver README, «Reportes para la demo»).
// npm run demo:reportes -- <carpeta>
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const carpeta = process.argv[2];
if (!carpeta) {
  console.error('Falta la carpeta: npm run demo:reportes -- <carpeta con las fotos y demo.json>');
  process.exit(1);
}

// Después de leer el .env: la configuración del servidor se valida al importarla.
const { cargarDemo } = await import('./cargarDemo.js');
const { prisma } = await import('../compartido/prisma.js');
try {
  const resultados = await cargarDemo(carpeta);
  console.table(
    resultados.map((r) => ({
      foto: r.foto,
      vecino: r.vecino,
      reporte: r.id,
      incidente: r.incidenteId,
      'controles (0-100)': r.nivelConfianza,
      punto: r.punto,
    })),
  );
  console.log('Listo: los reportes quedaron pendientes. Procesalos con la IA desde /revision.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
