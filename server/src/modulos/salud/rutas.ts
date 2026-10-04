import { Router } from 'express';
import { consultarSalud } from './servicio.js';

export const rutasSalud = Router();

rutasSalud.get('/', async (_req, res) => {
  res.json(await consultarSalud());
});
