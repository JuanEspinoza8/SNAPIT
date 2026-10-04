import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ErrorApp } from './errores.js';

// Errores que tira express.json(). Vienen de http-errors: traen status y expose = true si son culpa del cliente.
const erroresDelCuerpo: Record<string, { codigo: string; mensaje: string }> = {
  'entity.parse.failed': { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo no es un JSON válido' },
  'entity.too.large': {
    codigo: 'CUERPO_DEMASIADO_GRANDE',
    mensaje: 'El cuerpo supera el tamaño máximo permitido',
  },
  'charset.unsupported': {
    codigo: 'FORMATO_NO_SOPORTADO',
    mensaje: 'La codificación del cuerpo no está soportada',
  },
  'encoding.unsupported': {
    codigo: 'FORMATO_NO_SOPORTADO',
    mensaje: 'La compresión del cuerpo no está soportada',
  },
};

export const rutaNoEncontrada: RequestHandler = (req, _res, next) => {
  next(new ErrorApp(404, 'RUTA_NO_ENCONTRADA', `No existe ${req.method} ${req.path}`));
};

export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ErrorApp) {
    const { codigo, message: mensaje, detalles } = err;
    res.status(err.status).json({ error: detalles ? { codigo, mensaje, detalles } : { codigo, mensaje } });
    return;
  }

  if (err?.expose === true && err.status >= 400 && err.status < 500) {
    const error = erroresDelCuerpo[err.type] ?? {
      codigo: 'PETICION_INVALIDA',
      mensaje: 'La petición no es válida',
    };
    res.status(err.status).json({ error });
    return;
  }

  // Error no controlado: pino-http lo loguea completo (ver registrarPeticiones), al cliente no le llega el detalle.
  res.err = err;
  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
};
