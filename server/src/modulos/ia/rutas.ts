import { Router } from 'express';
import { autenticar, permitirRoles } from '../../compartido/autenticacion.js';
import { recibirFoto } from '../../compartido/recibirFoto.js';
import { clasificarFoto } from './clasificarFoto.js';
import { iniciarProceso, listarProcesos, verProceso } from './cola.js';

export const rutasIa = Router();

// Solo vecinos, que son los que cargan reportes. Primero la sesión: nadie sin permiso sube un archivo.
rutasIa.post('/clasificar-foto', autenticar, permitirRoles('VECINO'), recibirFoto, async (req, res) => {
  res.json(await clasificarFoto(req.usuario!.id, req.file?.buffer));
});

// Cola de verificación con IA: el operador procesa los pendientes de su organismo y sigue el log.
const operador = [autenticar, permitirRoles('OPERADOR', 'ADMINISTRADOR')];

// Responde enseguida (202): el procesamiento sigue en segundo plano.
rutasIa.post('/procesar-cola', ...operador, async (req, res) => {
  res.status(202).json(await iniciarProceso(req.usuario!));
});

rutasIa.get('/procesos', ...operador, async (req, res) => {
  res.json(await listarProcesos(req.usuario!));
});

rutasIa.get('/procesos/:id', ...operador, async (req, res) => {
  res.json(await verProceso(req.usuario!, req.params));
});
