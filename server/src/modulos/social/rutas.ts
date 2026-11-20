import { Router } from 'express';
import { autenticar, permitirRoles, sesionOpcional } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { esquemaFeed, esquemaId } from '../incidentes/esquemas.js';
import * as servicio from './servicio.js';

// Lo social del feed. Leer es público, como el mapa; con sesión, cada reporte dice si ya le diste me gusta y cada
// comentario si es tuyo. Dar me gusta y comentar es de los vecinos (#149). Van bajo /api/social para no chocar
// con las del operador: POST /api/incidentes/:id/comentarios es la bitácora, no un comentario público.
export const rutasSocial = Router();

// El feed de publicaciones: los reportes publicados, del más nuevo al más viejo.
rutasSocial.get('/feed', sesionOpcional, async (req, res) => {
  res.json(await servicio.listarFeed(validar(esquemaFeed, req.query), req.usuario?.id ?? null));
});

rutasSocial.get('/incidentes/:id/reportes', sesionOpcional, async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.listarReportesDeIncidente(id, req.usuario?.id ?? null));
});

rutasSocial.get('/incidentes/:id/comentarios', sesionOpcional, async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.listarComentariosDeIncidente(id, req.usuario?.id ?? null));
});

rutasSocial.get('/reportes/:id', sesionOpcional, async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.obtenerReporte(id, req.usuario?.id ?? null));
});

rutasSocial.get('/reportes/:id/comentarios', sesionOpcional, async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.listarComentariosDeReporte(id, req.usuario?.id ?? null));
});

rutasSocial.post('/reportes/:id/me-gusta', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await servicio.darMeGusta(req.usuario!, req.params));
});

rutasSocial.delete('/reportes/:id/me-gusta', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await servicio.quitarMeGusta(req.usuario!, req.params));
});

rutasSocial.post('/reportes/:id/comentarios', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.status(201).json(await servicio.comentarReporte(req.usuario!, req.params, req.body));
});

rutasSocial.post('/incidentes/:id/comentarios', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.status(201).json(await servicio.comentarIncidente(req.usuario!, req.params, req.body));
});

// Editar: solo su autor. Eliminar: su autor, o un operador o administrador (moderación). servicio.ts lo controla.
rutasSocial.patch('/comentarios/:id', autenticar, async (req, res) => {
  res.json(await servicio.editarComentario(req.usuario!, req.params, req.body));
});

rutasSocial.delete('/comentarios/:id', autenticar, async (req, res) => {
  await servicio.eliminarComentario(req.usuario!, req.params);
  res.status(204).end();
});
