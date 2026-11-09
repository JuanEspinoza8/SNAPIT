import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearUsuario } from './apoyo.js';

const CASA = { nombre: 'Casa', lat: -38.9516, lon: -68.0591, radioMetros: 300 };

async function vecino() {
  const token = crearTokenAcceso(await crearUsuario());
  const conToken = <T extends request.Test>(pedido: T) => pedido.set('Authorization', `Bearer ${token}`);
  return {
    crear: (cuerpo: object) => conToken(request(app).post('/api/zonas-habituales').send(cuerpo)),
    listar: () => conToken(request(app).get('/api/zonas-habituales')),
    editar: (id: number | string, cuerpo: object) =>
      conToken(request(app).put(`/api/zonas-habituales/${id}`).send(cuerpo)),
    borrar: (id: number | string) => conToken(request(app).delete(`/api/zonas-habituales/${id}`)),
  };
}

describe('POST /api/zonas-habituales', () => {
  it('crea la zona activa y devuelve su centro tal como se guardó', async () => {
    const api = await vecino();

    const res = await api.crear({ ...CASA, nombre: '  Casa  ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      nombre: 'Casa',
      lat: expect.closeTo(CASA.lat, 6),
      lon: expect.closeTo(CASA.lon, 6),
      radioMetros: 300,
      activa: true,
      creadoEn: expect.any(String),
    });
  });

  it('se puede crear pausada', async () => {
    const api = await vecino();

    expect((await api.crear({ ...CASA, activa: false })).body.activa).toBe(false);
  });

  it.each([0, -5])('un radio de %s responde 400', async (radioMetros) => {
    const api = await vecino();

    const res = await api.crear({ ...CASA, radioMetros });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'radioMetros', mensaje: 'Tiene que ser mayor que 0' }]);
  });

  it('un radio con decimales, demasiado grande o faltante responde 400', async () => {
    const api = await vecino();

    expect((await api.crear({ ...CASA, radioMetros: 1.5 })).status).toBe(400);
    expect((await api.crear({ ...CASA, radioMetros: 3_000_000_000 })).status).toBe(400);
    const sinRadio = { nombre: CASA.nombre, lat: CASA.lat, lon: CASA.lon };
    expect((await api.crear(sinRadio)).body.error.detalles).toEqual([
      { campo: 'radioMetros', mensaje: 'Es obligatorio' },
    ]);
  });

  it('valida el nombre y las coordenadas', async () => {
    const api = await vecino();

    const res = await api.crear({ ...CASA, nombre: ' ', lat: 91, lon: '-68' });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles.map((d: { campo: string }) => d.campo)).toEqual(['nombre', 'lat', 'lon']);
  });
});

describe('GET /api/zonas-habituales', () => {
  it('cada vecino ve solo las suyas, de la más vieja a la más nueva', async () => {
    const ana = await vecino();
    const beto = await vecino();
    const casa = (await ana.crear(CASA)).body;
    const trabajo = (await ana.crear({ ...CASA, nombre: 'Trabajo' })).body;
    await beto.crear({ ...CASA, nombre: 'De Beto' });

    const res = await ana.listar();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ zonas: [casa, trabajo] });
  });
});

describe('PUT /api/zonas-habituales/:id', () => {
  it('reemplaza nombre, centro, radio y si está activa', async () => {
    const api = await vecino();
    const { id } = (await api.crear(CASA)).body;
    const cambios = { nombre: 'Casa nueva', lat: -38.95, lon: -68.06, radioMetros: 500, activa: false };

    const res = await api.editar(id, cambios);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, nombre: 'Casa nueva', radioMetros: 500, activa: false });
    expect(res.body.lat).toBeCloseTo(-38.95, 6);
    expect(res.body.lon).toBeCloseTo(-68.06, 6);
  });

  it('pide la zona entera: sin activa responde 400', async () => {
    const api = await vecino();
    const { id } = (await api.crear(CASA)).body;

    const res = await api.editar(id, CASA);

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'activa', mensaje: 'Es obligatorio' }]);
  });

  it('un radio de 0 responde 400', async () => {
    const api = await vecino();
    const { id } = (await api.crear(CASA)).body;

    expect((await api.editar(id, { ...CASA, activa: true, radioMetros: 0 })).status).toBe(400);
  });

  it('la zona de otro vecino responde 404 y no cambia', async () => {
    const ana = await vecino();
    const beto = await vecino();
    const zona = (await ana.crear(CASA)).body;

    const res = await beto.editar(zona.id, { ...CASA, nombre: 'Robada', activa: false });

    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('ZONA_NO_ENCONTRADA');
    expect((await ana.listar()).body.zonas).toEqual([zona]);
  });
});

describe('DELETE /api/zonas-habituales/:id', () => {
  it('borra la zona', async () => {
    const api = await vecino();
    const { id } = (await api.crear(CASA)).body;

    expect((await api.borrar(id)).status).toBe(204);

    expect((await api.listar()).body.zonas).toEqual([]);
    expect(await prisma.zonaHabitual.count({ where: { id } })).toBe(0);
    expect((await api.borrar(id)).status).toBe(404);
  });

  it('la zona de otro vecino responde 404 y sigue estando', async () => {
    const ana = await vecino();
    const beto = await vecino();
    const zona = (await ana.crear(CASA)).body;

    expect((await beto.borrar(zona.id)).status).toBe(404);
    expect((await ana.listar()).body.zonas).toEqual([zona]);
  });
});

describe('permisos de /api/zonas-habituales', () => {
  it('es solo para vecinos: un operador recibe 403 y sin sesión, 401', async () => {
    const operador = crearTokenAcceso(await crearUsuario({ rol: 'OPERADOR' }));

    const res = await request(app).get('/api/zonas-habituales').set('Authorization', `Bearer ${operador}`);

    expect(res.status).toBe(403);
    expect((await request(app).post('/api/zonas-habituales').send(CASA)).status).toBe(401);
  });
});
