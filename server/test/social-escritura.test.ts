import { randomUUID } from 'node:crypto';
import type { EstadoIncidente, EstadoVerificacion, RolUsuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearUsuario } from './apoyo.js';

// Me gusta y comentarios (#149). Los incidentes se arman directo en la base, en (0, 0), como en social.test.ts.
const incidentes: number[] = [];

afterAll(async () => {
  await prisma.comentario.deleteMany({ where: { incidenteId: { in: incidentes } } });
  await prisma.reporte.deleteMany({ where: { incidenteId: { in: incidentes } } });
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
});

async function crearIncidente(estado: EstadoIncidente = 'VERIFICADO') {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, estado, ubicacion)
    VALUES (${categoria.id}, ${estado}::estado_incidente, ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography)
    RETURNING id`) as [{ id: number }];
  incidentes.push(id);
  return { id, categoriaId: categoria.id };
}

// El reporte, de ayer: los vecinos se numeran por orden de llegada, y el comentario toma la hora de Node, no la
// de la base. Con unos milisegundos de diferencia entre los dos relojes, el comentario podría quedar antes.
const HACE_UN_DIA = new Date(Date.now() - 24 * 60 * 60 * 1000);

/** Un reporte de un vecino nuevo en un incidente nuevo. */
async function crearReporte({
  estado = 'VERIFICADO',
  incidente = 'VERIFICADO',
}: { estado?: EstadoVerificacion; incidente?: EstadoIncidente } = {}) {
  const { id: incidenteId, categoriaId } = await crearIncidente(incidente);
  const autor = await crearUsuario();
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO reporte (incidente_id, usuario_id, categoria_id, severidad_declarada, ubicacion, origen,
                         estado_verificacion, creado_en)
    VALUES (${incidenteId}, ${autor.id}, ${categoriaId}, 'LEVE',
            ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography, 'APP_MOVIL', ${estado}::estado_verificacion,
            ${HACE_UN_DIA})
    RETURNING id`) as [{ id: number }];
  return { id, incidenteId, autor };
}

async function sesion(rol: RolUsuario = 'VECINO') {
  const usuario = await crearUsuario({ rol });
  return { usuario, token: `Bearer ${crearTokenAcceso(usuario)}` };
}

describe('me gusta', () => {
  it('un vecino da y quita su me gusta; dos veces no duplica ni falla', async () => {
    const reporte = await crearReporte();
    const { token } = await sesion();
    const url = `/api/social/reportes/${reporte.id}/me-gusta`;

    const dado = await request(app).post(url).set('Authorization', token);
    const otraVez = await request(app).post(url).set('Authorization', token);

    expect(dado.status).toBe(200);
    expect(dado.body).toEqual({ reporteId: reporte.id, cantidadMeGusta: 1, yaMeGusta: true });
    expect(otraVez.body.cantidadMeGusta).toBe(1);
    const conSesion = await request(app)
      .get(`/api/social/reportes/${reporte.id}`)
      .set('Authorization', token);
    expect(conSesion.body).toMatchObject({ cantidadMeGusta: 1, yaMeGusta: true });
    const sinSesion = await request(app).get(`/api/social/reportes/${reporte.id}`);
    expect(sinSesion.body.yaMeGusta).toBe(false);

    const quitado = await request(app).delete(url).set('Authorization', token);
    const quitadoOtraVez = await request(app).delete(url).set('Authorization', token);
    expect(quitado.body).toEqual({ reporteId: reporte.id, cantidadMeGusta: 0, yaMeGusta: false });
    expect(quitadoOtraVez.status).toBe(200);
  });

  it('sin sesión → 401; operador o administrador → 403; un reporte que no se ve → 404', async () => {
    const reporte = await crearReporte();
    const desestimado = await crearReporte({ estado: 'DESESTIMADO' });
    const url = `/api/social/reportes/${reporte.id}/me-gusta`;

    expect((await request(app).post(url)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(url)
          .set('Authorization', (await sesion('OPERADOR')).token)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(url)
          .set('Authorization', (await sesion('ADMINISTRADOR')).token)
      ).status,
    ).toBe(403);
    const vecino = (await sesion()).token;
    const res = await request(app)
      .post(`/api/social/reportes/${desestimado.id}/me-gusta`)
      .set('Authorization', vecino);
    expect(res.status).toBe(404);
  });
});

describe('comentarios', () => {
  it('un vecino comenta un reporte: sale con su número, como suyo, y suma al contador', async () => {
    const reporte = await crearReporte();
    const { token } = await sesion();

    const res = await request(app)
      .post(`/api/social/reportes/${reporte.id}/comentarios`)
      .set('Authorization', token)
      .send({ texto: '  Pasé recién y sigue igual  ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      texto: 'Pasé recién y sigue igual',
      editadoEn: null,
      esMio: true,
      // El autor del reporte es el vecino 1; quien comenta, el 2.
      autor: { numero: 2, nombre: 'Vecino 2', sistema: false },
    });
    const lista = await request(app)
      .get(`/api/social/reportes/${reporte.id}/comentarios`)
      .set('Authorization', token);
    expect(lista.body.comentarios).toEqual([expect.objectContaining({ id: res.body.id, esMio: true })]);
    const ajena = await request(app).get(`/api/social/reportes/${reporte.id}/comentarios`);
    expect(ajena.body.comentarios[0].esMio).toBe(false);
    const detalle = await request(app).get(`/api/social/reportes/${reporte.id}`);
    expect(detalle.body.cantidadComentarios).toBe(1);
  });

  it('un texto vacío o de más de 1000 caracteres → 400; operador → 403; reporte que no se ve → 404', async () => {
    const reporte = await crearReporte();
    const pendienteDeUnIncidenteDesestimado = await crearReporte({ incidente: 'DESESTIMADO' });
    const { token } = await sesion();
    const comentar = (id: number, texto: string, con = token) =>
      request(app).post(`/api/social/reportes/${id}/comentarios`).set('Authorization', con).send({ texto });

    expect((await comentar(reporte.id, '   ')).status).toBe(400);
    expect((await comentar(reporte.id, 'a'.repeat(1001))).status).toBe(400);
    expect((await comentar(reporte.id, 'a'.repeat(1000))).status).toBe(201);
    expect((await comentar(reporte.id, 'Hola', (await sesion('OPERADOR')).token)).status).toBe(403);
    expect((await comentar(pendienteDeUnIncidenteDesestimado.id, 'Hola')).status).toBe(404);
  });

  it('su autor lo edita; uno ajeno → 403', async () => {
    const reporte = await crearReporte();
    const autor = await sesion();
    const otro = await sesion();
    const creado = await request(app)
      .post(`/api/social/reportes/${reporte.id}/comentarios`)
      .set('Authorization', autor.token)
      .send({ texto: 'Primera versión' });
    const url = `/api/social/comentarios/${creado.body.id}`;

    const ajeno = await request(app).patch(url).set('Authorization', otro.token).send({ texto: 'Otra cosa' });
    const editado = await request(app)
      .patch(url)
      .set('Authorization', autor.token)
      .send({ texto: 'Corregido' });

    expect(ajeno.status).toBe(403);
    expect(editado.status).toBe(200);
    expect(editado.body).toMatchObject({ id: creado.body.id, texto: 'Corregido', esMio: true });
    expect(editado.body.editadoEn).not.toBeNull();
  });

  it('lo elimina su autor o un operador o administrador; otro vecino no; eliminado → 404', async () => {
    const reporte = await crearReporte();
    const autor = await sesion();
    const comentar = async () =>
      (
        await request(app)
          .post(`/api/social/reportes/${reporte.id}/comentarios`)
          .set('Authorization', autor.token)
          .send({ texto: 'Un comentario' })
      ).body.id as number;
    const eliminar = (id: number, token: string) =>
      request(app).delete(`/api/social/comentarios/${id}`).set('Authorization', token);

    const propio = await comentar();
    expect((await eliminar(propio, (await sesion()).token)).status).toBe(403);
    expect((await eliminar(propio, autor.token)).status).toBe(204);
    expect((await eliminar(propio, autor.token)).status).toBe(404);
    const editar = await request(app)
      .patch(`/api/social/comentarios/${propio}`)
      .set('Authorization', autor.token)
      .send({ texto: 'Ya no existe' });
    expect(editar.status).toBe(404);

    const ofensivo = await comentar();
    expect((await eliminar(ofensivo, (await sesion('OPERADOR')).token)).status).toBe(204);
    const otroOfensivo = await comentar();
    expect((await eliminar(otroOfensivo, (await sesion('ADMINISTRADOR')).token)).status).toBe(204);
    const detalle = await request(app).get(`/api/social/reportes/${reporte.id}`);
    expect(detalle.body.cantidadComentarios).toBe(0);
  });
});

describe('comentarios en el incidente', () => {
  const comentar = (incidenteId: number, texto: string, token?: string) => {
    const pedido = request(app).post(`/api/social/incidentes/${incidenteId}/comentarios`).send({ texto });
    return token ? pedido.set('Authorization', token) : pedido;
  };

  it('un vecino comenta el problema: sale con su número y se lee en el incidente, no en el reporte', async () => {
    const reporte = await crearReporte();
    const { token } = await sesion();

    const res = await comentar(reporte.incidenteId, '  Sigue igual en toda la cuadra  ', token);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      texto: 'Sigue igual en toda la cuadra',
      editadoEn: null,
      esMio: true,
      autor: { numero: 2, nombre: 'Vecino 2', sistema: false },
    });
    const delIncidente = await request(app)
      .get(`/api/social/incidentes/${reporte.incidenteId}/comentarios`)
      .set('Authorization', token);
    expect(delIncidente.body.comentarios).toEqual([
      expect.objectContaining({ id: res.body.id, esMio: true }),
    ]);
    const delReporte = await request(app).get(`/api/social/reportes/${reporte.id}/comentarios`);
    expect(delReporte.body.comentarios).toEqual([]);
  });

  it('sin sesión → 401; operador → 403; texto vacío o largo → 400; incidente que no se ve → 404', async () => {
    const reporte = await crearReporte();
    const desestimado = await crearReporte({ incidente: 'DESESTIMADO' });
    const { token } = await sesion();

    expect((await comentar(reporte.incidenteId, 'Hola')).status).toBe(401);
    expect((await comentar(reporte.incidenteId, 'Hola', (await sesion('OPERADOR')).token)).status).toBe(403);
    expect((await comentar(reporte.incidenteId, 'Hola', (await sesion('ADMINISTRADOR')).token)).status).toBe(
      403,
    );
    expect((await comentar(reporte.incidenteId, '   ', token)).status).toBe(400);
    expect((await comentar(reporte.incidenteId, 'a'.repeat(1001), token)).status).toBe(400);
    expect((await comentar(desestimado.incidenteId, 'Hola', token)).status).toBe(404);
    expect((await comentar(2_000_000_000, 'Hola', token)).status).toBe(404);
  });

  it('en un incidente unido a otro, el comentario va al principal', async () => {
    const principal = await crearReporte();
    const unido = await crearReporte();
    await prisma.incidente.update({
      where: { id: unido.incidenteId },
      data: { incidentePrincipalId: principal.incidenteId },
    });
    const { token } = await sesion();

    const res = await comentar(unido.incidenteId, 'Es el mismo pozo', token);

    expect(res.status).toBe(201);
    const guardado = await prisma.comentario.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(guardado.incidenteId).toBe(principal.incidenteId);
  });

  it('su autor lo edita y lo elimina; un operador también lo elimina', async () => {
    const reporte = await crearReporte();
    const autor = await sesion();
    const creado = await comentar(reporte.incidenteId, 'Primera versión', autor.token);
    const url = `/api/social/comentarios/${creado.body.id}`;

    const editado = await request(app)
      .patch(url)
      .set('Authorization', autor.token)
      .send({ texto: 'Corregido' });
    const ajeno = await request(app)
      .delete(url)
      .set('Authorization', (await sesion()).token);
    const moderado = await request(app)
      .delete(url)
      .set('Authorization', (await sesion('OPERADOR')).token);

    expect(editado.status).toBe(200);
    expect(editado.body).toMatchObject({ texto: 'Corregido', esMio: true });
    expect(ajeno.status).toBe(403);
    expect(moderado.status).toBe(204);
    const lista = await request(app).get(`/api/social/incidentes/${reporte.incidenteId}/comentarios`);
    expect(lista.body.comentarios).toEqual([]);
  });
});
