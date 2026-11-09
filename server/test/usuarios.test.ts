import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearOrganismoDePrueba, crearUsuario } from './apoyo.js';

const perfiles: number[] = [];

afterAll(async () => {
  await prisma.usuario.updateMany({
    where: { perfilMovilidadId: { in: perfiles } },
    data: { perfilMovilidadId: null },
  });
  await prisma.perfilMovilidad.deleteMany({ where: { id: { in: perfiles } } });
});

async function perfil(activo = true) {
  const { id } = await prisma.perfilMovilidad.create({ data: { nombre: `Perfil ${randomUUID()}`, activo } });
  perfiles.push(id);
  return id;
}

const cambiarYo = (token: string, cuerpo: object) =>
  request(app).patch('/api/usuarios/yo').set('Authorization', `Bearer ${token}`).send(cuerpo);

describe('PATCH /api/usuarios/yo', () => {
  it('apaga y prende el interruptor general de avisos', async () => {
    const vecino = await crearUsuario();
    const token = crearTokenAcceso(vecino);

    const apagado = await cambiarYo(token, { notificacionesHabilitadas: false });

    expect(apagado.status).toBe(200);
    expect(apagado.body.usuario).toMatchObject({ id: vecino.id, notificacionesHabilitadas: false });
    const enLaBase = await prisma.usuario.findUniqueOrThrow({ where: { id: vecino.id } });
    expect(enLaBase.notificacionesHabilitadas).toBe(false);

    expect(
      (await cambiarYo(token, { notificacionesHabilitadas: true })).body.usuario.notificacionesHabilitadas,
    ).toBe(true);
  });

  it('elige el perfil de movilidad por defecto y lo quita con null', async () => {
    const vecino = await crearUsuario();
    const token = crearTokenAcceso(vecino);
    const perfilId = await perfil();

    const elegido = await cambiarYo(token, { perfilMovilidadId: perfilId });
    expect(elegido.status).toBe(200);
    expect(elegido.body.usuario).toMatchObject({
      perfilMovilidadId: perfilId,
      notificacionesHabilitadas: true,
    });

    const quitado = await cambiarYo(token, { perfilMovilidadId: null });
    expect(quitado.body.usuario.perfilMovilidadId).toBeNull();
  });

  it('el cambio se ve en GET /api/auth/yo', async () => {
    const vecino = await crearUsuario();
    const token = crearTokenAcceso(vecino);
    await cambiarYo(token, { notificacionesHabilitadas: false });

    const res = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${token}`);

    expect(res.body.usuario.notificacionesHabilitadas).toBe(false);
  });

  it('un perfil inexistente o dado de baja responde 400 y no cambia nada', async () => {
    const vecino = await crearUsuario();
    const token = crearTokenAcceso(vecino);
    const inactivo = await perfil(false);

    for (const perfilMovilidadId of [inactivo, 2_147_483_647]) {
      const res = await cambiarYo(token, { perfilMovilidadId, notificacionesHabilitadas: false });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles).toEqual([
        { campo: 'perfilMovilidadId', mensaje: 'No existe ese perfil de movilidad' },
      ]);
    }
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: vecino.id } })).notificacionesHabilitadas,
    ).toBe(true);
  });

  it('sin ningún cambio, o con tipos equivocados, responde 400', async () => {
    const token = crearTokenAcceso(await crearUsuario());

    expect((await cambiarYo(token, {})).status).toBe(400);
    expect((await cambiarYo(token, { nombre: 'Otro nombre' })).status).toBe(400);
    const res = await cambiarYo(token, { notificacionesHabilitadas: 'no', perfilMovilidadId: 'uno' });
    expect(res.body.error.detalles.map((d: { campo: string }) => d.campo)).toEqual([
      'perfilMovilidadId',
      'notificacionesHabilitadas',
    ]);
  });

  it('también lo usa un operador', async () => {
    const token = crearTokenAcceso(await crearUsuario({ rol: 'OPERADOR' }));

    expect((await cambiarYo(token, { perfilMovilidadId: await perfil() })).status).toBe(200);
  });

  it('una cuenta dada de baja responde 401', async () => {
    const token = crearTokenAcceso(await crearUsuario({ dadoDeBaja: true }));

    expect((await cambiarYo(token, { notificacionesHabilitadas: false })).status).toBe(401);
  });

  it('sin sesión responde 401', async () => {
    expect(
      (await request(app).patch('/api/usuarios/yo').send({ notificacionesHabilitadas: false })).status,
    ).toBe(401);
  });
});

describe('/api/preferencias-notificacion', () => {
  let categoriaId: number;
  let otraCategoriaId: number;
  let inactivaId: number;

  beforeAll(async () => {
    categoriaId = (await crearOrganismoDePrueba()).categoria.id;
    otraCategoriaId = (await crearOrganismoDePrueba()).categoria.id;
    inactivaId = (await crearOrganismoDePrueba()).categoria.id;
    await prisma.categoria.update({ where: { id: inactivaId }, data: { activa: false } });
  });

  async function vecino() {
    const token = crearTokenAcceso(await crearUsuario());
    return {
      leer: () => request(app).get('/api/preferencias-notificacion').set('Authorization', `Bearer ${token}`),
      guardar: (cuerpo: object) =>
        request(app)
          .put('/api/preferencias-notificacion')
          .set('Authorization', `Bearer ${token}`)
          .send(cuerpo),
    };
  }

  const de = (lista: { categoriaId: number; habilitada: boolean }[], id: number) =>
    lista.find((p) => p.categoriaId === id);

  it('sin tocar nada, todas las categorías activas vienen habilitadas, en el orden del catálogo', async () => {
    const api = await vecino();

    const res = await api.leer();

    expect(res.status).toBe(200);
    const { preferencias } = res.body;
    expect(preferencias.every((p: { habilitada: boolean }) => p.habilitada)).toBe(true);
    expect(de(preferencias, categoriaId)).toEqual({ categoriaId, habilitada: true });
    expect(de(preferencias, inactivaId)).toBeUndefined();

    // Otros tests crean categorías en paralelo: se comparan solo las que están en las dos listas.
    const ids: number[] = preferencias.map((p: { categoriaId: number }) => p.categoriaId);
    const catalogo: number[] = (await request(app).get('/api/categorias')).body.categorias.map(
      (c: { id: number }) => c.id,
    );
    expect(ids.filter((id) => catalogo.includes(id))).toEqual(catalogo.filter((id) => ids.includes(id)));
  });

  it('cambia solo las categorías que se mandan y devuelve la lista completa', async () => {
    const api = await vecino();

    const res = await api.guardar({ preferencias: [{ categoriaId, habilitada: false }] });

    expect(res.status).toBe(200);
    expect(de(res.body.preferencias, categoriaId)).toEqual({ categoriaId, habilitada: false });
    expect(de(res.body.preferencias, otraCategoriaId)).toEqual({
      categoriaId: otraCategoriaId,
      habilitada: true,
    });

    // Se puede volver a cambiar: la segunda vez actualiza la misma fila.
    await api.guardar({ preferencias: [{ categoriaId, habilitada: true }] });
    expect(de((await api.leer()).body.preferencias, categoriaId)).toEqual({ categoriaId, habilitada: true });
  });

  it('una lista vacía no cambia nada', async () => {
    const api = await vecino();

    const res = await api.guardar({ preferencias: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual((await api.leer()).body);
  });

  it('una categoría inexistente o inactiva responde 400 y no guarda ninguna', async () => {
    const api = await vecino();

    const res = await api.guardar({
      preferencias: [
        { categoriaId, habilitada: false },
        { categoriaId: inactivaId, habilitada: false },
        { categoriaId: 2_147_483_647, habilitada: false },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'preferencias.1.categoriaId', mensaje: 'No existe esa categoría' },
      { campo: 'preferencias.2.categoriaId', mensaje: 'No existe esa categoría' },
    ]);
    expect(de((await api.leer()).body.preferencias, categoriaId)?.habilitada).toBe(true);
  });

  it('una categoría repetida o un cuerpo sin lista responde 400', async () => {
    const api = await vecino();

    const repetida = await api.guardar({
      preferencias: [
        { categoriaId, habilitada: false },
        { categoriaId, habilitada: true },
      ],
    });
    expect(repetida.status).toBe(400);
    expect((await api.guardar({ preferencias: 'todas' })).status).toBe(400);
    expect((await api.guardar({})).status).toBe(400);
  });

  it('es solo para vecinos: un operador recibe 403', async () => {
    const operador = crearTokenAcceso(await crearUsuario({ rol: 'OPERADOR' }));

    const res = await request(app)
      .get('/api/preferencias-notificacion')
      .set('Authorization', `Bearer ${operador}`);

    expect(res.status).toBe(403);
  });
});
