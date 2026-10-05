import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { tokenDe } from './apoyo.js';

const listar = (token: string) =>
  request(app).get('/api/admin/organismos').set('Authorization', `Bearer ${token}`);

const crearOrganismo = (activo = true) =>
  prisma.organismo.create({ data: { nombre: 'Organismo de prueba', activo } });

const crearArea = (organismoId: number, nombre: string, activa = true) =>
  prisma.area.create({ data: { organismoId, nombre, activa } });

describe('GET /api/admin/organismos', () => {
  it('lista los organismos activos con sus áreas activas, ordenadas por nombre', async () => {
    const organismo = await crearOrganismo();
    const veredas = await crearArea(organismo.id, 'Veredas');
    const bacheo = await crearArea(organismo.id, 'Bacheo');
    await crearArea(organismo.id, 'Arbolado', false);

    const res = await listar(await tokenDe('ADMINISTRADOR'));

    expect(res.status).toBe(200);
    expect(res.body.organismos).toContainEqual({
      id: organismo.id,
      nombre: 'Organismo de prueba',
      areas: [
        { id: bacheo.id, nombre: 'Bacheo' },
        { id: veredas.id, nombre: 'Veredas' },
      ],
    });
  });

  it('un organismo activo sin áreas activas aparece con la lista vacía', async () => {
    const organismo = await crearOrganismo();
    await crearArea(organismo.id, 'Bacheo', false);

    const res = await listar(await tokenDe('ADMINISTRADOR'));

    expect(res.body.organismos).toContainEqual({
      id: organismo.id,
      nombre: 'Organismo de prueba',
      areas: [],
    });
  });

  it('no incluye los organismos inactivos', async () => {
    const inactivo = await crearOrganismo(false);
    await crearArea(inactivo.id, 'Bacheo');

    const res = await listar(await tokenDe('ADMINISTRADOR'));

    expect(
      res.body.organismos.find((organismo: { id: number }) => organismo.id === inactivo.id),
    ).toBeUndefined();
  });

  it('un vecino o un operador recibe 403, y sin sesión 401', async () => {
    for (const rol of ['VECINO', 'OPERADOR'] as const) {
      const res = await listar(await tokenDe(rol));
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    }
    expect((await request(app).get('/api/admin/organismos')).status).toBe(401);
  });
});
