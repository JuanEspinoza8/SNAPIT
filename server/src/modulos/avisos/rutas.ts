import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';
import * as zonas from './zonas.js';

// Avisos al vecino (F10). Dispositivos y avisos, con cualquier sesión: también un operador puede usar la app.
// Las zonas habituales son solo del vecino. El seguimiento va en incidentes/rutas.ts, por su URL.
export const rutasAvisos = Router();

rutasAvisos.post('/dispositivos', autenticar, async (req, res) => {
  await servicio.registrarDispositivo(req.usuario!, req.body);
  res.status(204).end();
});

rutasAvisos.get('/notificaciones', autenticar, async (req, res) => {
  res.json(await servicio.listarNotificaciones(req.usuario!));
});

rutasAvisos.post('/notificaciones/:id/leida', autenticar, async (req, res) => {
  await servicio.marcarLeida(req.usuario!, req.params);
  res.status(204).end();
});

rutasAvisos.get('/zonas-habituales', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await zonas.listarZonas(req.usuario!));
});

rutasAvisos.post('/zonas-habituales', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.status(201).json(await zonas.crearZona(req.usuario!, req.body));
});

rutasAvisos.put('/zonas-habituales/:id', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await zonas.actualizarZona(req.usuario!, req.params, req.body));
});

rutasAvisos.delete('/zonas-habituales/:id', autenticar, permitirRoles('VECINO'), async (req, res) => {
  await zonas.borrarZona(req.usuario!, req.params);
  res.status(204).end();
});
