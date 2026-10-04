import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const LARGO_MAXIMO_ID = 100;

export function registrarPeticiones(logger: Logger) {
  return pinoHttp({
    logger,
    // Si el cliente manda un X-Request-Id usable lo respetamos; si no, generamos uno.
    genReqId: (req, res) => {
      const recibido = req.headers['x-request-id'];
      const id =
        typeof recibido === 'string' && recibido.length > 0 && recibido.length <= LARGO_MAXIMO_ID
          ? recibido
          : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // manejarErrores deja el error en res.err: así cada 500 queda en una sola línea, completa y en nivel error.
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
  });
}
