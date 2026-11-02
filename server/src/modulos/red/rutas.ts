import { Router } from 'express';
import { prisma } from '../../compartido/prisma.js';
import { listarZonasActivas } from './repositorio.js';

export const rutasRed = Router();

// Pública: la app la dibuja en el mapa para que se sepa dónde se puede pedir un recorrido.
rutasRed.get('/zona-piloto', async (_req, res) => {
  const zonas = await listarZonasActivas(prisma);
  res.json({
    type: 'FeatureCollection',
    features: zonas.map(({ id, nombre, geometria }) => ({
      type: 'Feature',
      id,
      properties: { nombre },
      geometry: geometria,
    })),
  });
});
