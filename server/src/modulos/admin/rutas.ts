import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { esquemaAltaUsuario } from './esquemas.js';
import * as servicio from './servicio.js';

export const rutasAdmin = Router();

// Todo lo que cuelga de /api/admin es solo para administradores, también las rutas que se agreguen después.
rutasAdmin.use(autenticar, permitirRoles('ADMINISTRADOR'));

rutasAdmin.get('/organismos', async (req, res) => {
  res.json(await servicio.listarOrganismos(req.query));
});

rutasAdmin.post('/organismos', async (req, res) => {
  res.status(201).json(await servicio.crearOrganismo(req.body));
});

rutasAdmin.put('/organismos/:id', async (req, res) => {
  res.json(await servicio.modificarOrganismo(req.params, req.body));
});

rutasAdmin.delete('/organismos/:id', async (req, res) => {
  await servicio.darDeBajaOrganismo(req.params);
  res.status(204).end();
});

rutasAdmin.post('/areas', async (req, res) => {
  res.status(201).json(await servicio.crearArea(req.body));
});

rutasAdmin.put('/areas/:id', async (req, res) => {
  res.json(await servicio.modificarArea(req.params, req.body));
});

rutasAdmin.delete('/areas/:id', async (req, res) => {
  await servicio.darDeBajaArea(req.params);
  res.status(204).end();
});

rutasAdmin.post('/usuarios', async (req, res) => {
  const datos = validar(esquemaAltaUsuario, req.body ?? {});
  res.status(201).json(await servicio.crearUsuario(datos));
});

rutasAdmin.get('/usuarios', async (_req, res) => {
  res.json(await servicio.listarUsuarios());
});

rutasAdmin.put('/usuarios/:id', async (req, res) => {
  res.json(await servicio.modificarUsuario(req.usuario!, req.params, req.body));
});

rutasAdmin.delete('/usuarios/:id', async (req, res) => {
  await servicio.darDeBaja(req.usuario!, req.params);
  res.status(204).end();
});
