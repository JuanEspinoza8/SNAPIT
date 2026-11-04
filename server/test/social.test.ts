import { randomUUID } from 'node:crypto';
import type { EstadoIncidente, EstadoVerificacion } from '@prisma/client';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearUsuario } from './apoyo.js';

const incidentes: number[] = [];

async function crearCategoria() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  return prisma.categoria.create({ data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id } });
}

async function crearIncidente(
  categoriaId: number,
  {
    estado = 'VERIFICADO',
    principalId = null,
  }: { estado?: EstadoIncidente; principalId?: number | null } = {},
) {
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, estado, ubicacion, incidente_principal_id)
    VALUES (${categoriaId}, ${estado}::estado_incidente, ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography,
            ${principalId})
    RETURNING id`) as [{ id: number }];
  incidentes.push(id);
  return id;
}

async function crearReporte(
  incidenteId: number,
  categoriaId: number,
  usuarioId: number,
  {
    estado = 'VERIFICADO',
    eliminado = false,
    creadoEn = new Date('2026-10-01T12:00:00Z'),
  }: { estado?: EstadoVerificacion; eliminado?: boolean; creadoEn?: Date } = {},
) {
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO reporte (incidente_id, usuario_id, categoria_id, severidad_declarada, ubicacion, origen,
                         estado_verificacion, descripcion, creado_en, eliminado_en)
    VALUES (${incidenteId}, ${usuarioId}, ${categoriaId}, 'LEVE',
            ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography, 'APP_MOVIL', ${estado}::estado_verificacion,
            'Una baldosa rota', ${creadoEn}, ${eliminado ? new Date() : null})
    RETURNING id`) as [{ id: number }];
  const foto = await prisma.fotografia.create({
    data: { reporteId: id, rutaArchivo: `${randomUUID()}.jpg` },
  });
  return { id, fotoId: foto.id };
}

const darLikes = (reporteId: number, usuarioIds: number[]) =>
  prisma.meGustaReporte.createMany({ data: usuarioIds.map((usuarioId) => ({ reporteId, usuarioId })) });

const comentar = (
  de: { reporteId: number } | { incidenteId: number },
  usuarioId: number,
  texto: string,
  { creadoEn = new Date('2026-10-02T12:00:00Z'), eliminado = false } = {},
) =>
  prisma.comentario.create({
    data: { ...de, usuarioId, texto, creadoEn, eliminadoEn: eliminado ? new Date() : null },
  });

afterAll(async () => {
  await prisma.comentario.deleteMany({ where: { incidenteId: { in: incidentes } } });
  await prisma.incidente.updateMany({
    where: { id: { in: incidentes } },
    data: { incidentePrincipalId: null },
  });
  await prisma.reporte.deleteMany({ where: { incidenteId: { in: incidentes } } });
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
});

describe('GET /api/incidentes/:id/reportes', () => {
  it('es pública y devuelve cada reporte con su autor, sus fotos y sus contadores', async () => {
    const categoria = await crearCategoria();
    const id = await crearIncidente(categoria.id);
    const [ana, bruno, carla] = await Promise.all([crearUsuario(), crearUsuario(), crearUsuario()]);
    const primero = await crearReporte(id, categoria.id, ana.id);
    const segundo = await crearReporte(id, categoria.id, bruno.id, {
      creadoEn: new Date('2026-10-03T12:00:00Z'),
    });
    await darLikes(primero.id, [bruno.id, carla.id]);
    await comentar({ reporteId: primero.id }, carla.id, 'Lo vi ayer');
    await comentar({ reporteId: primero.id }, bruno.id, 'Borrado', { eliminado: true });

    const res = await request(app).get(`/api/incidentes/${id}/reportes`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      incidenteId: id,
      reportes: [
        {
          id: primero.id,
          incidenteId: id,
          descripcion: 'Una baldosa rota',
          creadoEn: '2026-10-01T12:00:00.000Z',
          // Del autor, solo el nombre: el correo y el rol no son públicos.
          autor: { id: ana.id, nombre: ana.nombre },
          fotos: [{ id: primero.fotoId, url: `/api/fotos/${primero.fotoId}` }],
          cantidadMeGusta: 2,
          cantidadComentarios: 1,
        },
        expect.objectContaining({ id: segundo.id, cantidadMeGusta: 0, cantidadComentarios: 0 }),
      ],
    });
  });

  it('no muestra reportes desestimados ni eliminados, y suma los de los incidentes unidos', async () => {
    const categoria = await crearCategoria();
    const principal = await crearIncidente(categoria.id);
    const unido = await crearIncidente(categoria.id, { principalId: principal });
    const vecino = await crearUsuario();
    const valido = await crearReporte(principal, categoria.id, vecino.id);
    const delUnido = await crearReporte(unido, categoria.id, vecino.id);
    await crearReporte(principal, categoria.id, vecino.id, { estado: 'DESESTIMADO' });
    await crearReporte(principal, categoria.id, vecino.id, { eliminado: true });

    // Pedir el unido devuelve los del principal, igual que la ficha.
    const res = await request(app).get(`/api/incidentes/${unido}/reportes`);

    expect(res.body.incidenteId).toBe(principal);
    expect(res.body.reportes.map((r: { id: number }) => r.id)).toEqual([valido.id, delUnido.id]);
  });

  it('un incidente desestimado o inexistente responde 404', async () => {
    const categoria = await crearCategoria();
    const desestimado = await crearIncidente(categoria.id, { estado: 'DESESTIMADO' });

    for (const id of [desestimado, 999_999_999]) {
      const res = await request(app).get(`/api/incidentes/${id}/reportes`);
      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('INCIDENTE_NO_ENCONTRADO');
    }
  });
});

describe('GET /api/incidentes/:id/comentarios', () => {
  it('devuelve los del incidente, del más viejo al más nuevo, sin los eliminados ni los de sus reportes', async () => {
    const categoria = await crearCategoria();
    const id = await crearIncidente(categoria.id);
    const [ana, bruno] = await Promise.all([crearUsuario(), crearUsuario()]);
    const reporte = await crearReporte(id, categoria.id, ana.id);
    const nuevo = await comentar({ incidenteId: id }, bruno.id, 'El segundo', {
      creadoEn: new Date('2026-10-05T12:00:00Z'),
    });
    const viejo = await comentar({ incidenteId: id }, ana.id, 'El primero');
    await comentar({ incidenteId: id }, ana.id, 'Ofensivo', { eliminado: true });
    await comentar({ reporteId: reporte.id }, bruno.id, 'Sobre la foto');

    const res = await request(app).get(`/api/incidentes/${id}/comentarios`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      incidenteId: id,
      comentarios: [
        {
          id: viejo.id,
          texto: 'El primero',
          creadoEn: '2026-10-02T12:00:00.000Z',
          editadoEn: null,
          autor: { id: ana.id, nombre: ana.nombre },
        },
        expect.objectContaining({ id: nuevo.id, texto: 'El segundo' }),
      ],
    });
  });
});

describe('GET /api/reportes/:id/publico y /comentarios', () => {
  it('devuelve el reporte y sus comentarios', async () => {
    const categoria = await crearCategoria();
    const principal = await crearIncidente(categoria.id);
    const unido = await crearIncidente(categoria.id, { principalId: principal });
    const [ana, bruno] = await Promise.all([crearUsuario(), crearUsuario()]);
    const reporte = await crearReporte(unido, categoria.id, ana.id);
    await darLikes(reporte.id, [bruno.id]);
    const comentario = await comentar({ reporteId: reporte.id }, bruno.id, 'Confirmo');

    const publico = await request(app).get(`/api/reportes/${reporte.id}/publico`);
    const comentarios = await request(app).get(`/api/reportes/${reporte.id}/comentarios`);

    expect(publico.status).toBe(200);
    // El incidente que ve el público: el principal, porque el suyo se unió a otro.
    expect(publico.body).toMatchObject({ id: reporte.id, incidenteId: principal, cantidadMeGusta: 1 });
    expect(comentarios.body.comentarios).toEqual([
      expect.objectContaining({ id: comentario.id, autor: { id: bruno.id, nombre: bruno.nombre } }),
    ]);
  });

  it('un reporte desestimado, eliminado, de un incidente que no se ve o inexistente responde 404', async () => {
    const categoria = await crearCategoria();
    const visible = await crearIncidente(categoria.id);
    const oculto = await crearIncidente(categoria.id, { estado: 'DESESTIMADO' });
    const vecino = await crearUsuario();
    const desestimado = await crearReporte(visible, categoria.id, vecino.id, { estado: 'DESESTIMADO' });
    const eliminado = await crearReporte(visible, categoria.id, vecino.id, { eliminado: true });
    const delOculto = await crearReporte(oculto, categoria.id, vecino.id);

    for (const id of [desestimado.id, eliminado.id, delOculto.id, 999_999_999]) {
      for (const ruta of ['publico', 'comentarios']) {
        const res = await request(app).get(`/api/reportes/${id}/${ruta}`);
        expect(res.status).toBe(404);
        expect(res.body.error.codigo).toBe('REPORTE_NO_ENCONTRADO');
      }
    }
  });

  it('un id que no es válido responde 400', async () => {
    const res = await request(app).get('/api/reportes/abc/comentarios');

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('contadores del feed', () => {
  it('suma los likes de sus reportes y los comentarios de sus reportes y del incidente', async () => {
    const categoria = await crearCategoria();
    const id = await crearIncidente(categoria.id);
    const [ana, bruno, carla] = await Promise.all([crearUsuario(), crearUsuario(), crearUsuario()]);
    const uno = await crearReporte(id, categoria.id, ana.id);
    const otro = await crearReporte(id, categoria.id, bruno.id);
    const desestimado = await crearReporte(id, categoria.id, carla.id, { estado: 'DESESTIMADO' });
    await darLikes(uno.id, [bruno.id, carla.id]);
    await darLikes(otro.id, [ana.id]);
    // Lo de un reporte desestimado y lo eliminado no cuenta.
    await darLikes(desestimado.id, [ana.id]);
    await comentar({ reporteId: uno.id }, carla.id, 'Sobre la foto');
    await comentar({ reporteId: desestimado.id }, ana.id, 'No cuenta');
    await comentar({ incidenteId: id }, ana.id, 'Sobre el incidente');
    await comentar({ incidenteId: id }, ana.id, 'Borrado', { eliminado: true });

    const res = await request(app).get('/api/incidentes/feed').query({ categoriaId: categoria.id });

    expect(res.body.incidentes).toEqual([
      expect.objectContaining({ id, cantidadMeGusta: 3, cantidadComentarios: 2 }),
    ]);
  });
});
