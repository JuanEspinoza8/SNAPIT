import { Router } from 'express';
import { autenticar } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { esquemaIngreso, esquemaRegistro, esquemaTokenRenovacion } from './esquemas.js';
import * as servicio from './servicio.js';

export const rutasAuth = Router();

// Sin cuerpo JSON, req.body queda undefined: con {} cada campo faltante se informa por separado.

rutasAuth.post('/registro', async (req, res) => {
  const datos = validar(esquemaRegistro, req.body ?? {});
  res.status(201).json(await servicio.registrar(datos));
});

rutasAuth.post('/ingreso', async (req, res) => {
  const datos = validar(esquemaIngreso, req.body ?? {});
  res.json(await servicio.ingresar(datos));
});

rutasAuth.post('/renovar', async (req, res) => {
  const { tokenRenovacion } = validar(esquemaTokenRenovacion, req.body ?? {});
  res.json(await servicio.renovar(tokenRenovacion));
});

rutasAuth.post('/salir', async (req, res) => {
  const { tokenRenovacion } = validar(esquemaTokenRenovacion, req.body ?? {});
  await servicio.salir(tokenRenovacion);
  res.status(204).end();
});

rutasAuth.get('/yo', autenticar, async (req, res) => {
  res.json(await servicio.obtenerUsuarioActual(req.usuario!.id));
});
