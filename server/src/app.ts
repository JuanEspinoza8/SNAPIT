import express from 'express';
import { logger } from './config/logger.js';
import { manejarErrores, rutaNoEncontrada } from './compartido/manejarErrores.js';
import { registrarPeticiones } from './compartido/registrarPeticiones.js';
import { rutasAdmin } from './modulos/admin/rutas.js';
import { rutasAuth } from './modulos/auth/rutas.js';
import { rutasBandeja } from './modulos/bandeja/rutas.js';
import { rutasCatalogo } from './modulos/catalogo/rutas.js';
import { rutasIa } from './modulos/ia/rutas.js';
import { alCambiarIncidente } from './modulos/incidentes/eventos.js';
import { rutasIncidentes } from './modulos/incidentes/rutas.js';
import { recalcularPrioridad } from './modulos/prioridad/servicio.js';
import { rutasRed } from './modulos/red/rutas.js';
import { rutasFotos, rutasReportes } from './modulos/reportes/rutas.js';
import { rutasSalud } from './modulos/salud/rutas.js';

// Va acá y no en index.ts: los tests usan la app y tienen que ver la prioridad recalculada.
alCambiarIncidente(recalcularPrioridad);

export const app = express();

app.disable('x-powered-by');

app.use(registrarPeticiones(logger));

app.use(express.json({ limit: '1mb' }));

app.use('/api/salud', rutasSalud);
app.use('/api/auth', rutasAuth);
app.use('/api/admin', rutasAdmin);
app.use('/api', rutasCatalogo);
app.use('/api', rutasRed);
app.use('/api/reportes', rutasReportes);
app.use('/api/fotos', rutasFotos);
app.use('/api/incidentes', rutasIncidentes);
app.use('/api/bandeja', rutasBandeja);
app.use('/api/ia', rutasIa);

app.use(rutaNoEncontrada);
app.use(manejarErrores);
