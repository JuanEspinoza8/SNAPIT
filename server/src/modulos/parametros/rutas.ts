import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';

// /api/admin/parametros (#167): solo para administradores, como el resto de /api/admin.
export const rutasParametros = Router();

rutasParametros.use(autenticar, permitirRoles('ADMINISTRADOR'));

rutasParametros.get('/', async (_req, res) => {
  res.json(await servicio.listar());
});

rutasParametros.put('/', async (req, res) => {
  res.json(await servicio.guardar(req.body));
});
