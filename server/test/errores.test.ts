import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ErrorApp } from '../src/compartido/errores.js';
import { manejarErrores } from '../src/compartido/manejarErrores.js';
import { logger } from '../src/config/logger.js';

// App mínima con rutas que fallan a propósito, usando el mismo manejador de errores.
const app = express();
app.use(pinoHttp({ logger }));
app.get('/esperado', () => {
  throw new ErrorApp(409, 'CONFLICTO', 'Ya existe');
});
app.get('/inesperado', async () => {
  throw new Error('detalle interno que no debe salir');
});
app.use(manejarErrores);

describe('manejo de errores', () => {
  it('un ErrorApp responde con su status, código y mensaje', async () => {
    const res = await request(app).get('/esperado');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { codigo: 'CONFLICTO', mensaje: 'Ya existe' } });
  });

  it('un error no controlado responde 500 genérico, sin stack ni detalle', async () => {
    const res = await request(app).get('/inesperado');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
    expect(res.text).not.toContain('detalle interno');
  });
});
