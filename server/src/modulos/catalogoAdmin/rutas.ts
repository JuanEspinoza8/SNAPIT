import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';

// /api/admin/categorias y /api/admin/perfiles-movilidad (#166): solo para administradores, como el resto de
// /api/admin. Son dos routers para montarlos en su ruta y no pasar dos veces por la autenticación.

export const rutasCategoriasAdmin = Router();
rutasCategoriasAdmin.use(autenticar, permitirRoles('ADMINISTRADOR'));

rutasCategoriasAdmin.get('/', async (_req, res) => {
  res.json(await servicio.listarCategorias());
});

rutasCategoriasAdmin.post('/', async (req, res) => {
  res.status(201).json(await servicio.crearCategoria(req.body));
});

rutasCategoriasAdmin.put('/:id', async (req, res) => {
  res.json(await servicio.modificarCategoria(req.params, req.body));
});

rutasCategoriasAdmin.delete('/:id', async (req, res) => {
  await servicio.darDeBajaCategoria(req.params);
  res.status(204).end();
});

rutasCategoriasAdmin.put('/:id/perfiles', async (req, res) => {
  res.json(await servicio.guardarMatriz(req.params, req.body));
});

export const rutasPerfilesAdmin = Router();
rutasPerfilesAdmin.use(autenticar, permitirRoles('ADMINISTRADOR'));

rutasPerfilesAdmin.get('/', async (_req, res) => {
  res.json(await servicio.listarPerfiles());
});

rutasPerfilesAdmin.post('/', async (req, res) => {
  res.status(201).json(await servicio.crearPerfil(req.body));
});

rutasPerfilesAdmin.put('/:id', async (req, res) => {
  res.json(await servicio.modificarPerfil(req.params, req.body));
});

rutasPerfilesAdmin.delete('/:id', async (req, res) => {
  await servicio.darDeBajaPerfil(req.params);
  res.status(204).end();
});
