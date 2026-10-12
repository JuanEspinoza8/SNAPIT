import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './compartido/prisma.js';
import { iniciarDireccionesPendientes } from './tareas/direccionesPendientes.js';

// En Express 5 el callback también recibe el error si no se pudo abrir el puerto (por ejemplo, ocupado).
const servidor = app.listen(env.PORT, (error) => {
  if (error) {
    logger.fatal({ err: error }, `No se pudo usar el puerto ${env.PORT}`);
    process.exit(1);
  }
  logger.info(`Servidor escuchando en http://localhost:${env.PORT}`);
});

// Las tareas van acá y no en app.ts: los tests usan la app sin que corran.
iniciarDireccionesPendientes();

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
