import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { esquemaAltaUsuario } from './esquemas.js';
import * as servicio from './servicio.js';

export const rutasAdmin = Router();

// Todo lo que cuelga de /api/admin es solo para administradores, también las rutas que se agreguen después.
rutasAdmin.use(autenticar, permitirRoles('ADMINISTRADOR'));

rutasAdmin.post('/usuarios', async (req, res) => {
  const datos = validar(esquemaAltaUsuario, req.body ?? {});
  res.status(201).json(await servicio.crearUsuario(datos));
});

rutasAdmin.get('/usuarios', async (_req, res) => {
  res.json(await servicio.listarUsuarios());
});
