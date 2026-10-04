import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Igual que el servidor: el .env está en la raíz del monorepo.
config({ path: path.resolve(import.meta.dirname, '../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
});
