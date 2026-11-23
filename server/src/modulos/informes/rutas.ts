import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';

// Informes de estado y prioridades (F14): solo operadores y administradores, y solo los de su organismo.
export const rutasInforme = Router();

rutasInforme.use(autenticar, permitirRoles('OPERADOR', 'ADMINISTRADOR'), (_req, res, next) => {
  // En la demo publicada la API pasa por el reenvío de Vercel, que guarda las respuestas 60 s si no se le
  // dice nada: un informe es de un organismo y no tiene que quedar en una caché compartida.
  res.set('Cache-Control', 'private, no-store');
  next();
});

rutasInforme.post('/', async (req, res) => {
  res.status(201).json(await servicio.generar(req.usuario!, req.body));
});

rutasInforme.get('/', async (req, res) => {
  res.json(await servicio.listar(req.usuario!));
});

rutasInforme.get('/:id/pdf', async (req, res) => {
  const { nombre, pdf } = await servicio.obtenerPdf(req.usuario!, req.params);
  res.type('application/pdf').attachment(nombre).send(pdf);
});

rutasInforme.get('/:id', async (req, res) => {
  res.json(await servicio.obtener(req.usuario!, req.params));
});
