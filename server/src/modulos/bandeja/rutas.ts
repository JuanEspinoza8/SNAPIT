import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';

// La bandeja del organismo (F08): solo operadores y administradores, y solo lo de su organismo.
export const rutasBandeja = Router();

rutasBandeja.get('/', autenticar, permitirRoles('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  res.json(await servicio.listarBandeja(req.usuario!, req.query));
});
