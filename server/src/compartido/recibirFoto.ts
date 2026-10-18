import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { ErrorApp } from './errores.js';

// La foto queda en memoria hasta validar todo: recién ahí se escribe en el almacén (o se descarta).
const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FOTO_MAX_MB * 1024 * 1024, files: 1, fields: 20 },
}).single('foto');

/**
 * Lee un formulario multipart con una foto en el campo "foto" (queda en req.file). Los errores al leer
 * el formulario son del cliente: se traducen al formato de la API.
 */
export const recibirFoto: RequestHandler = (req, res, next) => {
  multipart(req, res, (error: unknown) => {
    if (!error) return next();
    const codigo = error instanceof multer.MulterError ? error.code : null;
    if (codigo === 'LIMIT_FILE_SIZE' || codigo === 'LIMIT_UNEXPECTED_FILE') {
      const mensaje =
        codigo === 'LIMIT_FILE_SIZE'
          ? `Tiene que pesar hasta ${env.FOTO_MAX_MB} MB`
          : 'Se acepta una sola foto, en el campo "foto"';
      return next(new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo: 'foto', mensaje }]));
    }
    // Demasiados campos o un envío cortado a la mitad (por ejemplo, se cayó la conexión del celular).
    next(new ErrorApp(400, 'DATOS_INVALIDOS', 'No se pudo leer el formulario. Volvé a enviarlo.'));
  });
};
