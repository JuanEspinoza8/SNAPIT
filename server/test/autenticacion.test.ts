import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { autenticar, permitirRoles } from '../src/compartido/autenticacion.js';
import { manejarErrores } from '../src/compartido/manejarErrores.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';

// App mínima con una ruta solo para operadores y administradores, como las que van a venir.
const app = express();
app.get('/operador', autenticar, permitirRoles('OPERADOR', 'ADMINISTRADOR'), (req, res) => {
  res.json({ id: req.usuario!.id });
});
app.use(manejarErrores);

const token = (rol: 'VECINO' | 'OPERADOR' | 'ADMINISTRADOR') =>
  crearTokenAcceso({ id: 1, rol, organismoId: null, areaId: null });

describe('permitirRoles', () => {
  it('un vecino que pide una ruta de operador recibe 403', async () => {
    const res = await request(app)
      .get('/operador')
      .set('Authorization', `Bearer ${token('VECINO')}`);

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('un operador y un administrador pasan', async () => {
    for (const rol of ['OPERADOR', 'ADMINISTRADOR'] as const) {
      const res = await request(app)
        .get('/operador')
        .set('Authorization', `Bearer ${token(rol)}`);
      expect(res.status).toBe(200);
    }
  });

  it('sin sesión responde 401, no 403', async () => {
    const res = await request(app).get('/operador');

    expect(res.status).toBe(401);
  });

  it('un encabezado que no es Bearer responde 401', async () => {
    const res = await request(app)
      .get('/operador')
      .set('Authorization', `Basic ${token('OPERADOR')}`);

    expect(res.status).toBe(401);
  });
});
