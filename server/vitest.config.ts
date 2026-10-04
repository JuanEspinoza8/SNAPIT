import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: path.resolve(import.meta.dirname, '../.env'), quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Falta TEST_DATABASE_URL en el .env');
}

export default defineConfig({
  test: {
    // Los tests siempre corren contra la base de pruebas, nunca contra la de desarrollo.
    env: { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL },
    globalSetup: './test/prepararBase.ts',
  },
});
