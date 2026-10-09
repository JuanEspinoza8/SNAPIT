import { Router } from 'express';
import { validar } from '../../compartido/validar.js';
import { esquemaFiltros, esquemaId } from './esquemas.js';
import * as servicio from './servicio.js';

// Públicas: el mapa se ve sin iniciar sesión.
export const rutasIncidentes = Router();

rutasIncidentes.get('/', async (req, res) => {
  res.json(await servicio.listar(validar(esquemaFiltros, req.query)));
});

rutasIncidentes.get('/:id', async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.obtenerFicha(id));
});
