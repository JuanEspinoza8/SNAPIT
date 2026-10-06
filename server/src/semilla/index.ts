import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { CLAVE_USUARIOS_PRUEBA, USUARIOS_PRUEBA } from './datos.js';
import { cargarSemilla } from './cargarSemilla.js';

// No usa config/env.ts: la semilla solo necesita la base, no el correo ni los tokens.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

// Los usuarios de prueba tienen una clave conocida: en producción serían una puerta abierta.
// El catálogo y los parámetros se cargan igual, porque el sistema los necesita en cualquier entorno.
const usuariosPrueba = process.env.NODE_ENV !== 'production';

const prisma = new PrismaClient();

try {
  const totales = await cargarSemilla(prisma, { usuariosPrueba });
  console.log('Semilla cargada:', totales);
  if (usuariosPrueba) {
    console.log(`Usuarios de prueba (clave "${CLAVE_USUARIOS_PRUEBA}"):`);
    for (const { email, rol, area } of USUARIOS_PRUEBA) {
      console.log(`  ${rol.padEnd(13)} ${email}${area ? ` (${area})` : ''}`);
    }
  } else {
    console.log('Con NODE_ENV=production no se cargan los usuarios de prueba.');
  }
} catch (error) {
  console.error('No se pudo cargar la semilla:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
