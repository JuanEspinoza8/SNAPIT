import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { obtenerGestion } from '../bandeja/servicio.js';
import { fijarPrioridadManual, quitarPrioridadManual } from '../prioridad/ajusteManual.js';
import { esquemaFiltros, esquemaId } from './esquemas.js';
import { cambiarEstado, comentarIncidente, derivarIncidente } from './gestion.js';
import * as servicio from './servicio.js';
import { deshacerUnion, unirIncidentes } from './union.js';

// El mapa y la ficha son públicos: se ven sin iniciar sesión. La gestión del operador, no.
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

// Un operador fija la prioridad a mano con un motivo, o la quita (F07): solo en su organismo.
rutasIncidentes.put(
  '/:id/prioridad-manual',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await fijarPrioridadManual(req.usuario!, req.params, req.body));
  },
);

rutasIncidentes.delete(
  '/:id/prioridad-manual',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await quitarPrioridadManual(req.usuario!, req.params));
  },
);

// La ficha de gestión del operador (F08): reportes con sus señales, bitácora, prioridad y cierre.
rutasIncidentes.get(
  '/:id/gestion',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await obtenerGestion(req.usuario!, req.params));
  },
);

// El operador deriva, registra el avance y comenta (F08): solo en su organismo.
rutasIncidentes.post(
  '/:id/derivacion',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await derivarIncidente(req.usuario!, req.params, req.body));
  },
);

rutasIncidentes.post(
  '/:id/estado',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await cambiarEstado(req.usuario!, req.params, req.body));
  },
);

rutasIncidentes.post(
  '/:id/comentarios',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.status(201).json(await comentarIncidente(req.usuario!, req.params, req.body));
  },
);
