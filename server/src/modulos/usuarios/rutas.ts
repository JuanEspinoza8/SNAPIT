import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import * as servicio from './servicio.js';

// Lo que cada usuario configura de sí mismo. Las preferencias por categoría son de los avisos del vecino (F10).
export const rutasUsuarios = Router();

rutasUsuarios.patch('/usuarios/yo', autenticar, async (req, res) => {
  res.json(await servicio.actualizarYo(req.usuario!, req.body));
});

rutasUsuarios.get('/preferencias-notificacion', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await servicio.listarPreferencias(req.usuario!));
});

rutasUsuarios.put('/preferencias-notificacion', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await servicio.guardarPreferencias(req.usuario!, req.body));
});
