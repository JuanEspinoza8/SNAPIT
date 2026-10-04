import { execSync } from 'node:child_process';

// Aplica las migraciones en la base de pruebas. Si la base no existe, Prisma la crea.
export default function prepararBase() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
