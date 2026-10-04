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
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error('Variables de entorno inválidas:\n' + z.prettifyError(resultado.error));
  process.exit(1);
}

export const env = resultado.data;
export type Env = typeof env;
