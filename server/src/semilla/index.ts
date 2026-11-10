import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { z } from 'zod';
import { clave } from '../modulos/auth/esquemas.js';
import { CLAVE_USUARIOS_PRUEBA, USUARIOS_PRUEBA } from './datos.js';
import { cargarSemilla } from './cargarSemilla.js';

// No usa config/env.ts: la semilla solo necesita la base, no el correo ni los tokens.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

// La demo publicada corre en producción y necesita usuarios para mostrarse (#118). Con esta variable se
// cargan con una clave propia: la de CLAVE_USUARIOS_PRUEBA está en el repo, que es público.
const claveDemo = process.env.CLAVE_USUARIOS_DEMO || undefined;
if (claveDemo !== undefined) {
  const resultado = clave.safeParse(claveDemo);
  if (!resultado.success) {
    console.error('CLAVE_USUARIOS_DEMO inválida:\n' + z.prettifyError(resultado.error));
    process.exit(1);
  }
}

// Los usuarios de prueba tienen una clave conocida: en producción serían una puerta abierta.
// El catálogo y los parámetros se cargan igual, porque el sistema los necesita en cualquier entorno.
const usuariosPrueba = process.env.NODE_ENV !== 'production' || claveDemo !== undefined;

const prisma = new PrismaClient();

try {
  const totales = await cargarSemilla(prisma, { usuariosPrueba, claveUsuarios: claveDemo });
  console.log('Semilla cargada:', totales);
  if (usuariosPrueba) {
    const queClave = claveDemo ? 'la de CLAVE_USUARIOS_DEMO' : `"${CLAVE_USUARIOS_PRUEBA}"`;
    console.log(`Usuarios de prueba (clave ${queClave}):`);
    for (const { email, rol, area } of USUARIOS_PRUEBA) {
      console.log(`  ${rol.padEnd(13)} ${email}${area ? ` (${area})` : ''}`);
    }
  } else {
    console.log(
      'Con NODE_ENV=production no se cargan los usuarios de prueba (salvo con CLAVE_USUARIOS_DEMO).',
    );
  }
} catch (error) {
  console.error('No se pudo cargar la semilla:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
