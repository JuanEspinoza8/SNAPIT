import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app as appReal } from '../src/app.js';
import { ErrorApp } from '../src/compartido/errores.js';
import { manejarErrores } from '../src/compartido/manejarErrores.js';
import { registrarPeticiones } from '../src/compartido/registrarPeticiones.js';

interface LineaLog {
  level: number;
  msg: string;
  err?: { message: string; stack?: string };
  req?: { id?: string };
  res?: { statusCode: number };
}

// Logger que guarda las líneas en memoria, para poder revisar qué se logueó.
const lineas: LineaLog[] = [];
const loggerEnMemoria = pino({ level: 'info' }, { write: (linea: string) => lineas.push(JSON.parse(linea)) });

// App mínima con rutas que fallan a propósito, usando el mismo registro y manejador de errores.
const app = express();
app.use(registrarPeticiones(loggerEnMemoria));
app.get('/esperado', () => {
  throw new ErrorApp(409, 'CONFLICTO', 'Ya existe');
});
app.get('/con-detalles', () => {
  throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
    { campo: 'email', mensaje: 'Falta el correo' },
  ]);
});
app.get('/inesperado', async () => {
  throw new Error('detalle interno que no debe salir');
});
app.use(manejarErrores);

beforeEach(() => {
  lineas.length = 0;
});

describe('manejo de errores', () => {
  it('un ErrorApp responde con su status, código y mensaje', async () => {
    const res = await request(app).get('/esperado');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { codigo: 'CONFLICTO', mensaje: 'Ya existe' } });
  });

  it('un ErrorApp con detalles los incluye en la respuesta', async () => {
    const res = await request(app).get('/con-detalles');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Hay datos inválidos',
        detalles: [{ campo: 'email', mensaje: 'Falta el correo' }],
      },
    });
  });

  it('un error no controlado responde 500 genérico, sin stack ni detalle', async () => {
    const res = await request(app).get('/inesperado');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
    expect(res.text).not.toContain('detalle interno');
  });

  it('un error no controlado queda logueado una sola vez, completo y con el id de la petición', async () => {
    await request(app).get('/inesperado');

    const errores = lineas.filter((linea) => linea.level >= 50);
    expect(errores).toHaveLength(1);
    expect(errores[0]?.err?.message).toBe('detalle interno que no debe salir');
    expect(errores[0]?.err?.stack).toContain('errores.test.ts');
    expect(errores[0]?.req?.id).toBeTruthy();
    expect(errores[0]?.res?.statusCode).toBe(500);
  });
});

describe('errores del cuerpo de la petición', () => {
  it('un JSON mal formado responde 400', async () => {
    const res = await request(appReal)
      .post('/api/salud')
      .set('Content-Type', 'application/json')
      .send('{malo');

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('JSON_INVALIDO');
  });

  it('un cuerpo de más de 1 MB responde 413, no 500', async () => {
    const res = await request(appReal)
      .post('/api/salud')
      .send({ texto: 'a'.repeat(1_100_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
  });

  it('una codificación desconocida responde 415, no 500', async () => {
    const res = await request(appReal)
      .post('/api/salud')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{}');

    expect(res.status).toBe(415);
    expect(res.body.error.codigo).toBe('FORMATO_NO_SOPORTADO');
  });
});
