import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { recibirFoto } from '../../compartido/recibirFoto.js';
import { clasificarFoto } from './clasificarFoto.js';

export const rutasIa = Router();

// Solo vecinos, que son los que cargan reportes. Primero la sesión: nadie sin permiso sube un archivo.
rutasIa.post('/clasificar-foto', autenticar, permitirRoles('VECINO'), recibirFoto, async (req, res) => {
  res.json(await clasificarFoto(req.usuario!.id, req.file?.buffer));
});
