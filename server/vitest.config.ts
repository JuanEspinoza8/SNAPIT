import os from 'node:os';
import path from 'node:path';
import { config } from 'dotenv';
import { configDefaults, defineConfig } from 'vitest/config';

config({ path: path.resolve(import.meta.dirname, '../.env'), quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Falta TEST_DATABASE_URL en el .env');
}

const SEMILLA = 'test/semilla.test.ts';

export default defineConfig({
  test: {
    // Los tests siempre corren contra la base de pruebas, nunca contra la de desarrollo.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      // Las fotos de los tests van a una carpeta temporal, no a la de desarrollo.
      FOTOS_DIR: path.join(os.tmpdir(), 'snapit-fotos-test'),
      // Chico, para probar el límite sin mandar archivos enormes.
      FOTO_MAX_MB: '1',
      // Los tests simulan Nominatim. Si alguno se olvida, falla contra esta dirección local y no le
      // pega al servicio público.
      NOMINATIM_URL: 'http://127.0.0.1:9',
      // Los tests simulan la API de Claude: sin clave y con una dirección local, aunque el .env tenga una
      // clave real, ningún test hace una llamada que se cobre.
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    },
    globalSetup: './test/prepararBase.ts',
    // El primer test de cada archivo abre la conexión a la base: en una PC lenta o en CI pasa los 5 s por defecto.
    testTimeout: 15_000,
    // La semilla vuelve a cargar el catálogo y los parámetros que usan los demás tests: corre sola, al final,
    // para no cambiarles un valor mientras corren en paralelo.
    projects: [
      {
        extends: true,
        test: { name: 'general', exclude: [...configDefaults.exclude, SEMILLA], sequence: { groupOrder: 0 } },
      },
      { extends: true, test: { name: 'semilla', include: [SEMILLA], sequence: { groupOrder: 1 } } },
    ],
  },
});
