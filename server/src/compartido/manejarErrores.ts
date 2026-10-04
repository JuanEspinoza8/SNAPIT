import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ErrorApp } from './errores.js';

export const rutaNoEncontrada: RequestHandler = (req, _res, next) => {
  next(new ErrorApp(404, 'RUTA_NO_ENCONTRADA', `No existe ${req.method} ${req.path}`));
};

export const manejarErrores: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ErrorApp) {
    res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } });
    return;
  }

  // JSON mal formado en el cuerpo de la petición.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo no es un JSON válido' } });
    return;
  }

  // Error no controlado: se loguea completo pero al cliente no le llega el detalle.
  req.log.error({ err }, 'Error no controlado');
  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
};
