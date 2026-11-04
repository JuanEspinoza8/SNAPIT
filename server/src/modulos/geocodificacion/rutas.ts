import { Router } from 'express';
import { autenticar } from '../../compartido/autenticacion.js';
import { validar } from '../../compartido/validar.js';
import { esquemaBusqueda } from './esquemas.js';
import { buscarLugares } from './servicio.js';

// Con sesión: cada búsqueda gasta una de las consultas por segundo que permite el Nominatim público.
export const rutasGeocodificacion = Router();

rutasGeocodificacion.get('/', autenticar, async (req, res) => {
  const { texto } = validar(esquemaBusqueda, req.query);
  res.json(await buscarLugares(texto));
});
