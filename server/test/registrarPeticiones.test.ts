import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { registrarPeticiones } from '../src/compartido/registrarPeticiones.js';

const app = express();
app.use(registrarPeticiones(pino({ level: 'silent' })));
app.get('/', (_req, res) => {
  res.sendStatus(204);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('X-Request-Id', () => {
  it('respeta el id que manda el cliente', async () => {
    const res = await request(app).get('/').set('X-Request-Id', 'pedido-123');

    expect(res.headers['x-request-id']).toBe('pedido-123');
  });

  it('genera uno si el cliente no manda nada', async () => {
    const res = await request(app).get('/');

    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('genera uno si el que llega está vacío', async () => {
    const res = await request(app).get('/').set('X-Request-Id', '');

    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('genera uno si el que llega es demasiado largo', async () => {
    const res = await request(app).get('/').set('X-Request-Id', 'x'.repeat(101));

    expect(res.headers['x-request-id']).toMatch(UUID);
  });
});
