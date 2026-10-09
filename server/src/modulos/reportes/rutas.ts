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

/** Los errores al leer el formulario son del cliente: se traducen al formato de la API. */
const recibirFoto: RequestHandler = (req, res, next) => {
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

export const rutasReportes = Router();

// Primero la sesión y el rol: así nadie sin permiso llega a subir un archivo.
rutasReportes.post('/', autenticar, permitirRoles('VECINO'), recibirFoto, async (req, res) => {
  res.status(201).json(await servicio.crearReporte(req.usuario!.id, req.body, req.file?.buffer));
});

// Solo vecinos: devuelve solo los reportes de quien la pide.
rutasReportes.get('/mios', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await servicio.listarMisReportes(req.usuario!.id));
});

// Pública: el mapa muestra las fotos sin sesión. Solo las de incidentes que se ven en el mapa.
export const rutasFotos = Router();

rutasFotos.get('/:id', async (req, res, next) => {
  const { id } = validar(esquemaIdFoto, req.params);
  const ubicacion = await servicio.buscarArchivoFoto(id);
  res.sendFile(
    ubicacion,
    // Una hora: si el incidente sale del mapa, la foto deja de servirse sin esperar un día de caché.
    { headers: { 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } },
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
