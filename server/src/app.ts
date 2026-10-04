import express from 'express';
import { logger } from './config/logger.js';
import { manejarErrores, rutaNoEncontrada } from './compartido/manejarErrores.js';
import { registrarPeticiones } from './compartido/registrarPeticiones.js';
import { rutasSalud } from './modulos/salud/rutas.js';

export const app = express();

app.disable('x-powered-by');

app.use(registrarPeticiones(logger));

app.use(express.json({ limit: '1mb' }));

app.use('/api/salud', rutasSalud);

app.use(rutaNoEncontrada);
app.use(manejarErrores);
