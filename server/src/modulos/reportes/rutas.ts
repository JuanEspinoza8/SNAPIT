import { Router } from 'express';
import { autenticar, permitirRoles, sesionOpcional } from '../../compartido/autenticacion.js';
import { ErrorApp } from '../../compartido/errores.js';
import { recibirFoto } from '../../compartido/recibirFoto.js';
import { validar } from '../../compartido/validar.js';
import { esquemaIdFoto } from './esquemas.js';
import * as servicio from './servicio.js';

export const rutasReportes = Router();

// Primero la sesión y el rol: así nadie sin permiso llega a subir un archivo.
rutasReportes.post('/', autenticar, permitirRoles('VECINO'), recibirFoto, async (req, res) => {
  res.status(201).json(await servicio.crearReporte(req.usuario!.id, req.body, req.file?.buffer));
});

// Solo vecinos: devuelve solo los reportes de quien la pide.
rutasReportes.get('/mios', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await servicio.listarMisReportes(req.usuario!.id));
});

// Pública: el mapa muestra las fotos sin sesión, solo las de incidentes que se ven en el mapa.
// Con sesión, también las del dueño del reporte y las del organismo del operador.
export const rutasFotos = Router();

rutasFotos.get('/:id', sesionOpcional, async (req, res, next) => {
  const { id } = validar(esquemaIdFoto, req.params);
  const ubicacion = await servicio.buscarArchivoFoto(id, req.usuario ?? null);
  // Una hora: si el incidente sale del mapa, la foto deja de servirse sin esperar un día de caché.
  // Con sesión puede ser una foto privada: solo la guarda el navegador de quien la pidió, y Vary
  // evita que ese navegador la reuse para un pedido sin sesión.
  const cache = req.usuario ? 'private, max-age=3600' : 'public, max-age=3600';
  res.sendFile(
    ubicacion,
    {
      headers: { 'Cache-Control': cache, Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' },
    },
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
