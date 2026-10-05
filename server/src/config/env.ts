import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

// El .env vive en la raíz del monorepo. Si no existe (por ejemplo en Docker),
// dotenv no hace nada y se usan las variables del entorno.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
  // Firma los tokens de acceso. Si se filtra, cualquiera puede armar un token válido.
  JWT_SECRET: z.string().min(32, 'Tiene que tener al menos 32 caracteres'),
  // Los links de los correos apuntan a la web. Sin barra final, para armar `${URL_WEB}/ruta`.
  URL_WEB: z.url().transform((url) => url.replace(/\/+$/, '')),
  SMTP_HOST: z.string().min(1),
  SMTP_PUERTO: z.coerce.number().int().positive(),
  // Mailpit no pide usuario ni clave; un SMTP real, sí.
  SMTP_USUARIO: z.string().optional(),
  SMTP_CLAVE: z.string().optional(),
  CORREO_REMITENTE: z.string().min(1),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error('Variables de entorno inválidas:\n' + z.prettifyError(resultado.error));
  process.exit(1);
}

export const env = resultado.data;
export type Env = typeof env;
