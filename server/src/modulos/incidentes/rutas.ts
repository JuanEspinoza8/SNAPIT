import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { recibirFoto } from '../../compartido/recibirFoto.js';
import { validar } from '../../compartido/validar.js';
import { consultarSeguimiento, dejarDeSeguir, seguir } from '../avisos/seguimiento.js';
import { obtenerGestion } from '../bandeja/servicio.js';
import { cerrarIncidente, confirmarCierre } from '../cierre/servicio.js';
import { fijarPrioridadManual, quitarPrioridadManual } from '../prioridad/ajusteManual.js';
import { cambiarCategoria } from './categoria.js';
import { confirmar, consultarConfirmacion } from './confirmacion.js';
import { esquemaFeed, esquemaFiltros, esquemaId } from './esquemas.js';
import { cambiarEstado, comentarIncidente, derivarIncidente } from './gestion.js';
import * as servicio from './servicio.js';
import { deshacerUnion, unirIncidentes } from './union.js';

// El mapa y la ficha son públicos: se ven sin iniciar sesión. El seguimiento y la gestión del operador, no.
export const rutasIncidentes = Router();

rutasIncidentes.get('/', async (req, res) => {
  res.json(await servicio.listar(validar(esquemaFiltros, req.query)));
});

// La pantalla de inicio: los mismos incidentes del mapa, con fotos y de a páginas. Va antes de /:id.
rutasIncidentes.get('/feed', async (req, res) => {
  res.json(await servicio.listarFeed(validar(esquemaFeed, req.query)));
});

rutasIncidentes.get('/:id', async (req, res) => {
  const { id } = validar(esquemaId, req.params);
  res.json(await servicio.obtenerFicha(id));
});

// Un vecino sigue un incidente para enterarse de sus cambios (F10). El GET le dice a la ficha si ya lo sigue.
rutasIncidentes.get('/:id/seguimiento', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await consultarSeguimiento(req.usuario!, req.params));
});

rutasIncidentes.post('/:id/seguimiento', autenticar, permitirRoles('VECINO'), async (req, res) => {
  await seguir(req.usuario!, req.params);
  res.status(204).end();
});

rutasIncidentes.delete('/:id/seguimiento', autenticar, permitirRoles('VECINO'), async (req, res) => {
  await dejarDeSeguir(req.usuario!, req.params);
  res.status(204).end();
});

// Un vecino confirma que el problema sigue (F12). El GET le dice a la ficha si ya lo confirmó.
rutasIncidentes.get('/:id/confirmacion', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.json(await consultarConfirmacion(req.usuario!, req.params));
});

rutasIncidentes.post('/:id/confirmaciones', autenticar, permitirRoles('VECINO'), async (req, res) => {
  res.status(201).json(await confirmar(req.usuario!, req.params));
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

// El operador deriva, registra el avance, comenta y corrige la categoría (F06, F08): solo en su organismo.
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

rutasIncidentes.put(
  '/:id/categoria',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await cambiarCategoria(req.usuario!, req.params, req.body));
  },
);

// El cierre con la foto del después (F09). Primero la sesión: nadie sin permiso sube un archivo.
rutasIncidentes.post(
  '/:id/cierre',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  recibirFoto,
  async (req, res) => {
    res.status(201).json(await cerrarIncidente(req.usuario!, req.params, req.file?.buffer));
  },
);

// Otro operador confirma o rechaza un cierre observado (F09).
rutasIncidentes.post(
  '/:id/cierre/confirmacion',
  autenticar,
  permitirRoles('OPERADOR', 'ADMINISTRADOR'),
  async (req, res) => {
    res.json(await confirmarCierre(req.usuario!, req.params, req.body));
  },
);
