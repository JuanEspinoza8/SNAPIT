import { Router } from 'express';
import { autenticar } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';

// Consulta en lenguaje natural (F15): cualquiera con sesión.
export const rutasConsultas = Router();

rutasConsultas.post('/interpretar', autenticar, async (req, res) => {
  res.json(await servicio.interpretar(req.usuario!.id, req.body));
});
