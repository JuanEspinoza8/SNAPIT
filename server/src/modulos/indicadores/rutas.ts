import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';

// El panel de indicadores (F13): solo operadores y administradores, y solo lo de su organismo.
export const rutasIndicadores = Router();

rutasIndicadores.get('/', autenticar, permitirRoles('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  res.json(await servicio.obtenerIndicadores(req.usuario!, req.query));
});

rutasIndicadores.get('/calor', autenticar, permitirRoles('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  res.json(await servicio.obtenerCalor(req.usuario!, req.query));
});
