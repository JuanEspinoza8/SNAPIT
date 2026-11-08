import { Router } from 'express';
import { validar } from '../../compartido/validar.js';
import { esquemaId } from '../incidentes/esquemas.js';
import * as servicio from './servicio.js';

// Lo social del feed, por ahora solo para leer: públicas, sin sesión, como el mapa. Van bajo /api/social para no
// chocar con las del operador: POST /api/incidentes/:id/comentarios es la bitácora, no un comentario público.
export const rutasSocial = Router();

rutasSocial.get('/incidentes/:id/reportes', async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.listarReportesDeIncidente(id));
});

rutasSocial.get('/incidentes/:id/comentarios', async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.listarComentariosDeIncidente(id));
});

rutasSocial.get('/reportes/:id', async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.obtenerReporte(id));
});

rutasSocial.get('/reportes/:id/comentarios', async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.listarComentariosDeReporte(id));
});
