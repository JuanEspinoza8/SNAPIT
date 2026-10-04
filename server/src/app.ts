import { randomUUID } from 'node:crypto';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './config/logger.js';
import { manejarErrores, rutaNoEncontrada } from './compartido/manejarErrores.js';
import { rutasSalud } from './modulos/salud/rutas.js';

export const app = express();

app.disable('x-powered-by');

app.use(
  pinoHttp({
    logger,
    // Si el cliente manda un X-Request-Id lo respetamos; si no, generamos uno.
    genReqId: (req, res) => {
      const id = req.headers['x-request-id']?.toString() ?? randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
  }),
);

app.use(express.json({ limit: '1mb' }));

app.use('/api/salud', rutasSalud);

app.use(rutaNoEncontrada);
app.use(manejarErrores);
