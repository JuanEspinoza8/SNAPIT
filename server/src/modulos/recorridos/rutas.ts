import { Router } from 'express';
import { autenticar } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { esquemaRecorrido } from './esquemas.js';
import { calcularRecorrido } from './servicio.js';

// Con sesión, de cualquier rol: el recorrido no es de nadie en particular, pero cada consulta corre pgRouting.
export const rutasRecorridos = Router();

rutasRecorridos.get('/', autenticar, async (req, res) => {
  res.json(await calcularRecorrido(validar(esquemaRecorrido, req.query)));
});
