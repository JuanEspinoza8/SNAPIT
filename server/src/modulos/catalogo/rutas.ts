import { Router } from 'express';
import * as repositorio from './repositorio.js';

// Públicas: el mapa y el formulario de reporte las necesitan aunque nadie haya ingresado.
export const rutasCatalogo = Router();

rutasCatalogo.get('/categorias', async (_req, res) => {
  const categorias = await repositorio.listarCategoriasActivas();
  res.json({
    categorias: categorias.map(({ tipoVigenciaDefault, ...categoria }) => ({
      ...categoria,
      tipoVigencia: tipoVigenciaDefault,
    })),
  });
});

rutasCatalogo.get('/perfiles-movilidad', async (_req, res) => {
  res.json({ perfiles: await repositorio.listarPerfilesActivos() });
});
