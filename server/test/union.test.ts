import { randomUUID } from 'node:crypto';
import type { Area, Categoria, Severidad, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { alCambiarIncidente } from '../src/modulos/incidentes/eventos.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { jpegLiso } from './imagenes.js';

// La dirección no se consulta: no hace falta para unir.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

async function crearOrganismo() {
  const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  return { area, categoria };
}

async function crearOperador(area: Area) {
  const usuario = await crearUsuario({ rol: 'OPERADOR' });
  const operador = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { organismoId: area.organismoId, areaId: area.id },
  });
  return { operador, token: crearTokenAcceso(operador) };
}

let area: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;
// Cada test en su propia zona, para que sus reportes no se agrupen con los de otro test.
let lat: number;

beforeEach(async () => {
  ({ area, categoria } = await crearOrganismo());
  ({ operador, token } = await crearOperador(area));
  lat = -38.9 - Math.random() * 0.05;
});

/**
 * Un reporte en la cuadra `cuadra` de la zona del test (cada una a unos 110 m de la anterior: lejos del radio
 * de agrupación). Los reportes de la misma cuadra caen en el mismo incidente.
 */
async function reportar(
  cuadra: number,
  severidad: Severidad,
  registradoEn: string,
  enCategoria: Categoria = categoria,
) {
  const vecino = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(vecino.id);
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(enCategoria.id))
    .field('severidadDeclarada', severidad)
    .field('lat', String(lat - cuadra * 0.001))
    .field('lon', '-68.06')
    .field('origen', 'SITIO_WEB')
    .field('registradoEn', registradoEn)
    .attach('foto', await jpegLiso(128), 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number };
}

const unir = (id: number, cuerpo: object, conToken = token) =>
  request(app).post(`/api/incidentes/${id}/union`).set('Authorization', `Bearer ${conToken}`).send(cuerpo);

const deshacer = (id: number, conToken = token) =>
  request(app).delete(`/api/incidentes/${id}/union`).set('Authorization', `Bearer ${conToken}`);

/** Lo que tiene que quedar igual después de unir y deshacer. */
const foto = (id: number) =>
  prisma.incidente.findUniqueOrThrow({
    where: { id },
    select: {
      estado: true,
      severidad: true,
      cantidadReportes: true,
      primerReporteEn: true,
      incidentePrincipalId: true,
      categoriaId: true,
      areaId: true,
      reportes: { select: { id: true }, orderBy: { id: 'asc' } },
    },
  });

/** Un principal con un reporte LEVE y un duplicado con dos GRAVE, más viejos. */
async function dosIncidentes() {
  const principal = await reportar(0, 'LEVE', '2026-10-12T10:00:00Z');
  const duplicado = await reportar(1, 'GRAVE', '2026-10-10T10:00:00Z');
  await reportar(1, 'GRAVE', '2026-10-11T10:00:00Z');
  expect(principal.incidenteId).not.toBe(duplicado.incidenteId);
  return {
    principalId: principal.incidenteId,
    duplicadoId: duplicado.incidenteId,
    reporteDuplicado: duplicado.id,
  };
}

describe('POST /api/incidentes/:id/union', () => {
  it('el duplicado apunta al principal y conserva lo suyo; el principal suma sus reportes', async () => {
    const { principalId, duplicadoId, reporteDuplicado } = await dosIncidentes();

    const res = await unir(duplicadoId, { principalId, comentario: 'Es el mismo pozo' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: duplicadoId,
      // LEVE + GRAVE + GRAVE: la consolidada es GRAVE.
      principal: { id: principalId, estado: 'REGISTRADO', cantidadReportes: 3, severidad: 'GRAVE' },
    });
    expect(await foto(duplicadoId)).toMatchObject({
      incidentePrincipalId: principalId,
      estado: 'REGISTRADO',
      cantidadReportes: 2,
      severidad: 'GRAVE',
    });
    // El primer reporte del principal pasa a ser el más viejo del duplicado.
    expect(await foto(principalId)).toMatchObject({
      cantidadReportes: 3,
      severidad: 'GRAVE',
      primerReporteEn: new Date('2026-10-10T10:00:00Z'),
    });
    // Los reportes no se mueven.
    const reporte = await prisma.reporte.findUniqueOrThrow({ where: { id: reporteDuplicado } });
    expect(reporte.incidenteId).toBe(duplicadoId);
  });

  it('el duplicado sale del mapa y su ficha muestra la del principal, con todos los reportes', async () => {
    const { principalId, duplicadoId } = await dosIncidentes();

    await unir(duplicadoId, { principalId });

    const mapa = await request(app).get('/api/incidentes').query({ categoriaId: categoria.id });
    const ids = mapa.body.incidentes.map((i: { id: number }) => i.id);
    expect(ids).toContain(principalId);
    expect(ids).not.toContain(duplicadoId);
    const ficha = await request(app).get(`/api/incidentes/${duplicadoId}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body).toMatchObject({ id: principalId, cantidadVecinos: 3 });
    expect(ficha.body.fotos).toHaveLength(3);
  });

  it('deja un movimiento FUSION en cada incidente, apuntando al otro, y avisa a la prioridad', async () => {
    const { principalId, duplicadoId } = await dosIncidentes();
    const recalcular = vi.fn(async () => {});
    const darDeBaja = alCambiarIncidente(recalcular);

    await unir(duplicadoId, { principalId, comentario: 'Es el mismo pozo' });
    darDeBaja();

    const movimientos = await prisma.movimientoIncidente.findMany({
      where: { incidenteId: { in: [principalId, duplicadoId] } },
      orderBy: { id: 'asc' },
    });
    expect(movimientos).toEqual([
      expect.objectContaining({
        incidenteId: duplicadoId,
        incidenteRelacionadoId: principalId,
        tipo: 'FUSION',
        usuarioId: operador.id,
        comentario: `Unido al incidente #${principalId}: Es el mismo pozo`,
      }),
      expect.objectContaining({
        incidenteId: principalId,
        incidenteRelacionadoId: duplicadoId,
        tipo: 'FUSION',
        usuarioId: operador.id,
        comentario: `Se le unió el incidente #${duplicadoId}: Es el mismo pozo`,
      }),
    ]);
    expect(recalcular).toHaveBeenCalledWith(expect.anything(), principalId);
    expect(recalcular).toHaveBeenCalledWith(expect.anything(), duplicadoId);
  });

  it('se pueden unir incidentes de distinta categoría del mismo organismo', async () => {
    const otraCategoria = await prisma.categoria.create({
      data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
    });
    const principal = await reportar(0, 'LEVE', '2026-10-12T10:00:00Z');
    const duplicado = await reportar(0, 'GRAVE', '2026-10-12T11:00:00Z', otraCategoria);

    const res = await unir(duplicado.incidenteId, { principalId: principal.incidenteId });

    expect(res.status).toBe(200);
  });

  describe('no une', () => {
    it('un incidente consigo mismo', async () => {
      const { principalId } = await dosIncidentes();

      const res = await unir(principalId, { principalId });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('MISMO_INCIDENTE');
    });

    it('un incidente que ya está unido a otro', async () => {
      const { principalId, duplicadoId } = await dosIncidentes();
      const otro = await reportar(2, 'LEVE', '2026-10-12T10:00:00Z');
      await unir(duplicadoId, { principalId });

      const res = await unir(duplicadoId, { principalId: otro.incidenteId });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('YA_UNIDO');
    });

    it('a un principal que está unido a otro: no hay cadenas', async () => {
      const { principalId, duplicadoId } = await dosIncidentes();
      const otro = await reportar(2, 'LEVE', '2026-10-12T10:00:00Z');
      await unir(duplicadoId, { principalId });

      const res = await unir(otro.incidenteId, { principalId: duplicadoId });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('PRINCIPAL_UNIDO');
    });

    it('un incidente que ya tiene otros unidos: no hay cadenas', async () => {
      const { principalId, duplicadoId } = await dosIncidentes();
      const otro = await reportar(2, 'LEVE', '2026-10-12T10:00:00Z');
      await unir(duplicadoId, { principalId });

      const res = await unir(principalId, { principalId: otro.incidenteId });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('TIENE_UNIDOS');
    });

    it('un incidente resuelto o desestimado', async () => {
      const { principalId, duplicadoId } = await dosIncidentes();
      await prisma.incidente.update({ where: { id: principalId }, data: { estado: 'RESUELTO' } });

      const res = await unir(duplicadoId, { principalId });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('INCIDENTE_CERRADO');
    });

    it('con un incidente de otro organismo', async () => {
      const { principalId } = await dosIncidentes();
      const ajena = (await crearOrganismo()).categoria;
      const deOtroOrganismo = await reportar(3, 'LEVE', '2026-10-12T10:00:00Z', ajena);

      const res = await unir(deOtroOrganismo.incidenteId, { principalId });

      expect(res.status).toBe(403);
    });

    it('si el operador es de otro organismo', async () => {
      const { principalId, duplicadoId } = await dosIncidentes();
      const otro = await crearOperador((await crearOrganismo()).area);

      const res = await unir(duplicadoId, { principalId }, otro.token);

      expect(res.status).toBe(403);
      expect((await foto(duplicadoId)).incidentePrincipalId).toBeNull();
    });

    it('si lo pide un vecino o alguien sin sesión', async () => {
      const { principalId, duplicadoId } = await dosIncidentes();
      const vecino = crearTokenAcceso(await crearUsuario({ rol: 'VECINO' }));

      const comoVecino = await unir(duplicadoId, { principalId }, vecino);
      const sinSesion = await request(app).post(`/api/incidentes/${duplicadoId}/union`).send({ principalId });

      expect(comoVecino.status).toBe(403);
      expect(sinSesion.status).toBe(401);
    });

    it('si falta el principal o no existe', async () => {
      const { duplicadoId } = await dosIncidentes();

      const sinPrincipal = await unir(duplicadoId, {});
      const inexistente = await unir(duplicadoId, { principalId: 2_000_000_000 });

      expect(sinPrincipal.status).toBe(400);
      expect(inexistente.status).toBe(404);
    });
  });
});

describe('DELETE /api/incidentes/:id/union', () => {
  it('unir y después deshacer deja los dos incidentes exactamente como estaban', async () => {
    const { principalId, duplicadoId } = await dosIncidentes();
    const antes = { principal: await foto(principalId), duplicado: await foto(duplicadoId) };

    await unir(duplicadoId, { principalId });
    const res = await deshacer(duplicadoId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: duplicadoId,
      principal: { id: principalId, estado: 'REGISTRADO', cantidadReportes: 1, severidad: 'LEVE' },
    });
    expect({ principal: await foto(principalId), duplicado: await foto(duplicadoId) }).toEqual(antes);
    const mapa = await request(app).get('/api/incidentes').query({ categoriaId: categoria.id });
    expect(mapa.body.incidentes.map((i: { id: number }) => i.id)).toEqual(
      expect.arrayContaining([principalId, duplicadoId]),
    );
  });

  it('deja un movimiento SEPARACION en cada incidente, apuntando al otro', async () => {
    const { principalId, duplicadoId } = await dosIncidentes();
    await unir(duplicadoId, { principalId });

    await deshacer(duplicadoId);

    const separaciones = await prisma.movimientoIncidente.findMany({
      where: { incidenteId: { in: [principalId, duplicadoId] }, tipo: 'SEPARACION' },
      orderBy: { id: 'asc' },
    });
    expect(separaciones).toEqual([
      expect.objectContaining({
        incidenteId: duplicadoId,
        incidenteRelacionadoId: principalId,
        usuarioId: operador.id,
      }),
      expect.objectContaining({
        incidenteId: principalId,
        incidenteRelacionadoId: duplicadoId,
        usuarioId: operador.id,
      }),
    ]);
  });

  it('un incidente que no está unido da 409', async () => {
    const { duplicadoId } = await dosIncidentes();

    const res = await deshacer(duplicadoId);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('NO_UNIDO');
  });

  it('un operador de otro organismo no puede deshacerla', async () => {
    const { principalId, duplicadoId } = await dosIncidentes();
    await unir(duplicadoId, { principalId });
    const otro = await crearOperador((await crearOrganismo()).area);

    const res = await deshacer(duplicadoId, otro.token);

    expect(res.status).toBe(403);
    expect((await foto(duplicadoId)).incidentePrincipalId).toBe(principalId);
  });

  it('un incidente que no existe da 404', async () => {
    const res = await deshacer(2_000_000_000);

    expect(res.status).toBe(404);
  });
});
