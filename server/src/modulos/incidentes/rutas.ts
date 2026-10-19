import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { esquemaFiltros, esquemaId } from './esquemas.js';
import * as servicio from './servicio.js';
import { deshacerUnion, unirIncidentes } from './union.js';

// El mapa y la ficha son públicos: se ven sin iniciar sesión. Unir incidentes, no.
export const rutasIncidentes = Router();

rutasIncidentes.get('/', async (req, res) => {
  res.json(await servicio.listar(validar(esquemaFiltros, req.query)));
});

rutasIncidentes.get('/:id', async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.obtenerFicha(id));
});

// Un operador une un incidente duplicado a su principal, o deshace la unión (F05): solo en su organismo.
rutasIncidentes.post(
  '/:id/union',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await unirIncidentes(req.usuario!, req.params, req.body));
  },
);

rutasIncidentes.delete(
  '/:id/union',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await deshacerUnion(req.usuario!, req.params));
  },
);
