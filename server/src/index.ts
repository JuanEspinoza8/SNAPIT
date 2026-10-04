import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './compartido/prisma.js';

const servidor = app.listen(env.PORT, () => {
  logger.info(`Servidor escuchando en http://localhost:${env.PORT}`);
});

// Al cerrar (Ctrl+C o docker stop) se terminan las peticiones en curso y se cierra la base.
function apagar(senal: string) {
  logger.info(`${senal} recibido, apagando`);
  servidor.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
