import type { RequestHandler } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import { env } from '../../config/env.js';
import { esquemaIdFoto } from './esquemas.js';
import * as servicio from './servicio.js';

// La foto queda en memoria hasta validar todo: recién ahí se escribe en el almacén.
const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FOTO_MAX_MB * 1024 * 1024, files: 1, fields: 20 },
}).single('foto');

/** multer avisa sus errores con MulterError: se traducen al formato de la API. */
const recibirFoto: RequestHandler = (req, res, next) => {
  multipart(req, res, (error: unknown) => {
    if (!(error instanceof multer.MulterError)) return next(error);
    const mensaje =
      error.code === 'LIMIT_FILE_SIZE'
        ? `Tiene que pesar hasta ${env.FOTO_MAX_MB} MB`
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Se acepta una sola foto, en el campo "foto"'
          : 'No se pudo leer el formulario';
    next(new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo: 'foto', mensaje }]));
  });
};

export const rutasReportes = Router();

// Primero la sesión y el rol: así nadie sin permiso llega a subir un archivo.
rutasReportes.post('/', autenticar, permitirRoles('VECINO'), recibirFoto, async (req, res) => {
  res.status(201).json(await servicio.crearReporte(req.usuario!.id, req.body, req.file?.buffer));
});

// Públicas: el mapa muestra las fotos aunque nadie haya ingresado.
export const rutasFotos = Router();

rutasFotos.get('/:id', async (req, res, next) => {
  const { id } = validar(esquemaIdFoto, req.params);
  const ubicacion = await servicio.buscarArchivoFoto(id);
  res.sendFile(
    ubicacion,
    { headers: { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } },
    (error) => {
      if (!error) return;
      // La fila existe pero el archivo no (por ejemplo, se borró el volumen).
      next(
        'code' in error && error.code === 'ENOENT'
          ? new ErrorApp(404, 'FOTO_NO_ENCONTRADA', 'La foto no existe')
          : error,
      );
    },
  );
});
