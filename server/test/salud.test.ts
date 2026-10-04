import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

describe('GET /api/salud', () => {
  it('responde 200 e informa que la base está accesible', async () => {
    const res = await request(app).get('/api/salud');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', baseDeDatos: 'ok' });
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

describe('ruta inexistente', () => {
  it('responde 404 con el formato de error común', async () => {
    const res = await request(app).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'No existe GET /api/no-existe' },
    });
  });
});
