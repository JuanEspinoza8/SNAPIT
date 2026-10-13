import { Router } from 'express';
import * as repositorio from './repositorio.js';

// Públicas: el mapa y el formulario de reporte las necesitan aunque nadie haya ingresado.
export const rutasCatalogo = Router();

rutasCatalogo.get('/categorias', async (_req, res) => {
  res.json({ categorias: await repositorio.listarCategoriasActivas() });
});

rutasCatalogo.get('/perfiles-movilidad', async (_req, res) => {
  res.json({ perfiles: await repositorio.listarPerfilesActivos() });
});

rutasCatalogo.get('/barrios', async (_req, res) => {
  res.json({ barrios: await repositorio.listarBarriosConIncidentes() });
});
