import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearIncidente, crearOrganismoDePrueba, crearUsuario } from './apoyo.js';

let categoriaId: number;
const incidentes: number[] = [];

beforeAll(async () => {
  categoriaId = (await crearOrganismoDePrueba()).categoria.id;
});

afterAll(async () => {
  // Primero los duplicados: el principal no se puede borrar mientras otro apunta a él.
  await prisma.incidente.deleteMany({
    where: { id: { in: incidentes }, incidentePrincipalId: { not: null } },
  });
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
});

async function incidente(opciones: Parameters<typeof crearIncidente>[1] = {}) {
  const id = await crearIncidente(categoriaId, opciones);
  incidentes.push(id);
  return id;
}

const ruta = (id: number | string) => `/api/incidentes/${id}/seguimiento`;
const conSesion = (token: string) => ({
  seguir: (id: number | string) => request(app).post(ruta(id)).set('Authorization', `Bearer ${token}`),
  dejar: (id: number | string) => request(app).delete(ruta(id)).set('Authorization', `Bearer ${token}`),
  consultar: (id: number | string) => request(app).get(ruta(id)).set('Authorization', `Bearer ${token}`),
});

const seguimientosDe = (usuarioId: number) =>
  prisma.seguimientoIncidente.findMany({ where: { usuarioId }, select: { incidenteId: true } });

describe('seguir un incidente', () => {
  it('seguir dos veces el mismo incidente no falla ni duplica', async () => {
    const vecino = await crearUsuario();
    const id = await incidente();
    const api = conSesion(crearTokenAcceso(vecino));

    expect((await api.seguir(id)).status).toBe(204);
    expect((await api.seguir(id)).status).toBe(204);

    expect(await seguimientosDe(vecino.id)).toEqual([{ incidenteId: id }]);
    expect((await api.consultar(id)).body).toEqual({ siguiendo: true });
  });

  it('dejar de seguir lo quita, y no falla si ya no lo seguía', async () => {
    const vecino = await crearUsuario();
    const id = await incidente();
    const api = conSesion(crearTokenAcceso(vecino));
    await api.seguir(id);

    expect((await api.dejar(id)).status).toBe(204);
    expect((await api.dejar(id)).status).toBe(204);

    expect(await seguimientosDe(vecino.id)).toEqual([]);
    expect((await api.consultar(id)).body).toEqual({ siguiendo: false });
  });

  it('cada vecino tiene sus propios seguimientos', async () => {
    const id = await incidente();
    const ana = conSesion(crearTokenAcceso(await crearUsuario()));
    const beto = conSesion(crearTokenAcceso(await crearUsuario()));
    await ana.seguir(id);

    expect((await beto.consultar(id)).body).toEqual({ siguiendo: false });
    await beto.dejar(id);
    expect((await ana.consultar(id)).body).toEqual({ siguiendo: true });
  });

  it('seguir un incidente unido a otro sigue al principal, como la ficha', async () => {
    const vecino = await crearUsuario();
    const principal = await incidente();
    const duplicado = await incidente({ principalId: principal });
    const api = conSesion(crearTokenAcceso(vecino));

    expect((await api.seguir(duplicado)).status).toBe(204);

    expect(await seguimientosDe(vecino.id)).toEqual([{ incidenteId: principal }]);
    expect((await api.consultar(duplicado)).body).toEqual({ siguiendo: true });
  });

  it('lo que seguía en un incidente que después se unió cuenta para el principal', async () => {
    const vecino = await crearUsuario();
    const principal = await incidente();
    const duplicado = await incidente();
    const api = conSesion(crearTokenAcceso(vecino));
    await api.seguir(duplicado);
    await prisma.incidente.update({ where: { id: duplicado }, data: { incidentePrincipalId: principal } });

    expect((await api.consultar(principal)).body).toEqual({ siguiendo: true });

    await api.dejar(principal);
    expect(await seguimientosDe(vecino.id)).toEqual([]);
  });

  it('un incidente desestimado o inexistente no se puede seguir', async () => {
    const api = conSesion(crearTokenAcceso(await crearUsuario()));
    const desestimado = await incidente({ estado: 'DESESTIMADO' });

    const res = await api.seguir(desestimado);
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('INCIDENTE_NO_ENCONTRADO');
    expect((await api.seguir(2_147_483_647)).status).toBe(404);
    expect((await api.seguir('abc')).status).toBe(400);
  });

  it('se puede dejar de seguir un incidente que ya no está en el mapa', async () => {
    const vecino = await crearUsuario();
    const id = await incidente();
    const api = conSesion(crearTokenAcceso(vecino));
    await api.seguir(id);
    await prisma.incidente.update({ where: { id }, data: { estado: 'DESESTIMADO' } });

    expect((await api.dejar(id)).status).toBe(204);
    expect(await seguimientosDe(vecino.id)).toEqual([]);
  });

  it('consultar o dejar de seguir un incidente inexistente responde 404', async () => {
    const api = conSesion(crearTokenAcceso(await crearUsuario()));

    expect((await api.consultar(2_147_483_647)).status).toBe(404);
    expect((await api.dejar(2_147_483_647)).status).toBe(404);
  });

  it('es solo para vecinos: un operador recibe 403 y sin sesión, 401', async () => {
    const id = await incidente();
    const operador = conSesion(crearTokenAcceso(await crearUsuario({ rol: 'OPERADOR' })));

    expect((await operador.seguir(id)).status).toBe(403);
    expect((await operador.consultar(id)).status).toBe(403);
    expect((await request(app).post(ruta(id))).status).toBe(401);
  });
});
