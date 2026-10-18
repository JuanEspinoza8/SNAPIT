import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { crearClienteOverpass } from '../src/modulos/red/overpass.js';
import { describirResumen, importarPuntosInteres } from '../src/modulos/red/servicio.js';

// Como la semilla, no usa config/env.ts: solo necesita la base y Overpass, no el correo ni los tokens.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const ARCHIVO = fileURLToPath(new URL('../../db/datos/puntos-interes-neuquen.json', import.meta.url));
const USO = 'Uso: npm run importar:puntos [-- --sin-conexion]';

const opciones = process.argv.slice(2);
if (opciones.some((opcion) => opcion !== '--sin-conexion')) {
  console.error(`Opción desconocida: ${opciones.join(' ')}\n${USO}`);
  process.exit(1);
}
const sinConexion = opciones.includes('--sin-conexion');

const prisma = new PrismaClient();
const overpass = crearClienteOverpass({
  url: process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
  userAgent: 'SnapIt/1.0 (+https://github.com/JuanEspinoza8/SNAPIT)',
});
const archivoRelativo = path.relative(process.cwd(), ARCHIVO);

try {
  if (!sinConexion) console.log('Pidiendo los puntos de interés a Overpass (puede tardar un minuto)...');
  const resumen = await importarPuntosInteres({ prisma, archivo: ARCHIVO, sinConexion, overpass });
  if (!sinConexion) console.log(`Respuesta guardada en ${archivoRelativo}`);
  console.log(describirResumen(resumen));
} catch (error) {
  console.error(
    'No se pudieron importar los puntos de interés:',
    error instanceof Error ? error.message : error,
  );
  if (!sinConexion) {
    console.error(
      `Probá de nuevo en unos minutos o cargá la respuesta guardada en ${archivoRelativo}:\n  ${USO}`,
    );
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
