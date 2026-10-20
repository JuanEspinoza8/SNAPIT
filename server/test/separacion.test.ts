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

// La dirección no se consulta: no hace falta para separar.
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

let categoria: Categoria;
let operador: Usuario;
let token: string;
// Cada test en su propio punto: así sus reportes no se agrupan con los de otro test.
let lat: number;

beforeEach(async () => {
  let area: Area;
  ({ area, categoria } = await crearOrganismo());
  ({ operador, token } = await crearOperador(area));
  lat = -38.9 - Math.random() * 0.05;
});

/**
 * Un reporte en el punto del test. La foto es lisa: no trae EXIF (queda pendiente) y su hash no cuenta como
 * foto repetida. Todos los del mismo test caen en el mismo incidente: misma categoría, mismo punto (#53).
 */
async function reportar(severidad: Severidad, registradoEn: string, cuadra = 0) {
  const vecino = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(vecino.id);
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(categoria.id))
    .field('severidadDeclarada', severidad)
    // Otra cuadra (unos 110 m por cada una) ya no se agrupa: es otro incidente.
    .field('lat', String(lat - cuadra * 0.001))
    .field('lon', '-68.06')
    .field('origen', 'SITIO_WEB')
    .field('registradoEn', registradoEn)
    .attach('foto', await jpegLiso(128), 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number };
}

const separar = (id: number, cuerpo: object = {}, conToken = token) =>
  request(app).post(`/api/reportes/${id}/separacion`).set('Authorization', `Bearer ${conToken}`).send(cuerpo);

const incidente = (id: number) => prisma.incidente.findUniqueOrThrow({ where: { id } });

describe('POST /api/reportes/:id/separacion', () => {
  it('saca el reporte a un incidente nuevo y deja bien los contadores y la severidad de los dos', async () => {
    const primero = await reportar('LEVE', '2026-10-10T10:00:00Z');
    const segundo = await reportar('GRAVE', '2026-10-11T10:00:00Z');
    const tercero = await reportar('LEVE', '2026-10-12T10:00:00Z');
    const originalId = primero.incidenteId;
    expect([segundo.incidenteId, tercero.incidenteId]).toEqual([originalId, originalId]);
    // LEVE, GRAVE, LEVE: la consolidada es la más repetida.
    expect(await incidente(originalId)).toMatchObject({ cantidadReportes: 3, severidad: 'LEVE' });
    await prisma.reporte.update({
      where: { id: primero.id },
      data: { direccion: 'Avenida Argentina 100, Centro' },
    });

    const res = await separar(primero.id, { comentario: 'Es otro pozo, en la vereda de enfrente' });

    expect(res.status).toBe(200);
    const nuevoId = res.body.incidenteNuevo.id;
    expect(res.body).toEqual({
      reporteId: primero.id,
      incidenteNuevo: { id: nuevoId, estado: 'REGISTRADO', cantidadReportes: 1, severidad: 'LEVE' },
      // Quedan GRAVE y LEVE: ante un empate, la más alta.
      incidenteOriginal: { id: originalId, cantidadReportes: 2, severidad: 'GRAVE', estado: 'REGISTRADO' },
    });
    expect(nuevoId).not.toBe(originalId);
    const reporte = await prisma.reporte.findUniqueOrThrow({ where: { id: primero.id } });
    expect(reporte.incidenteId).toBe(nuevoId);

    expect(await incidente(nuevoId)).toMatchObject({
      categoriaId: categoria.id,
      areaId: null,
      cantidadReportes: 1,
      severidad: 'LEVE',
      direccion: 'Avenida Argentina 100, Centro',
      primerReporteEn: new Date('2026-10-10T10:00:00Z'),
    });
    // El original pierde su primer reporte: ahora arranca con el segundo.
    expect(await incidente(originalId)).toMatchObject({
      cantidadReportes: 2,
      severidad: 'GRAVE',
      primerReporteEn: new Date('2026-10-11T10:00:00Z'),
    });
  });

  it('deja un movimiento SEPARACION en cada incidente, apuntando al otro', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
    await reportar('MODERADA', '2026-10-11T10:00:00Z');

    const res = await separar(primero.id, { comentario: 'Está más adelante, no es el mismo' });

    const nuevoId = res.body.incidenteNuevo.id;
    const movimientos = await prisma.movimientoIncidente.findMany({
      where: { incidenteId: { in: [primero.incidenteId, nuevoId] } },
      orderBy: { id: 'asc' },
    });
    expect(movimientos).toEqual([
      expect.objectContaining({
        incidenteId: primero.incidenteId,
        incidenteRelacionadoId: nuevoId,
        tipo: 'SEPARACION',
        usuarioId: operador.id,
        comentario: `Reporte #${primero.id} separado al incidente #${nuevoId}: Está más adelante, no es el mismo`,
      }),
      expect.objectContaining({
        incidenteId: nuevoId,
        incidenteRelacionadoId: primero.incidenteId,
        tipo: 'SEPARACION',
        usuarioId: operador.id,
        comentario: `Reporte #${primero.id} separado del incidente #${primero.incidenteId}: Está más adelante, no es el mismo`,
      }),
    ]);
  });

  it('avisa a la prioridad de los dos incidentes', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
    await reportar('MODERADA', '2026-10-11T10:00:00Z');
    const recalcular = vi.fn(async () => {});
    const darDeBaja = alCambiarIncidente(recalcular);

    const res = await separar(primero.id);
    darDeBaja();

    expect(recalcular).toHaveBeenCalledWith(expect.anything(), primero.incidenteId);
    expect(recalcular).toHaveBeenCalledWith(expect.anything(), res.body.incidenteNuevo.id);
  });

  it('un reporte verificado se lleva un incidente verificado; el original conserva su estado', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
    await reportar('MODERADA', '2026-10-11T10:00:00Z');
    await prisma.reporte.update({ where: { id: primero.id }, data: { estadoVerificacion: 'VERIFICADO' } });
    await prisma.incidente.update({ where: { id: primero.incidenteId }, data: { estado: 'VERIFICADO' } });

    const res = await separar(primero.id);

    expect(res.status).toBe(200);
    expect(res.body.incidenteNuevo.estado).toBe('VERIFICADO');
    expect((await incidente(res.body.incidenteNuevo.id)).estado).toBe('VERIFICADO');
    expect((await incidente(primero.incidenteId)).estado).toBe('VERIFICADO');
  });

  it('el incidente nuevo aparece en el mapa público', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
    await reportar('MODERADA', '2026-10-11T10:00:00Z');

    const res = await separar(primero.id);

    const mapa = await request(app).get('/api/incidentes').query({ categoriaId: categoria.id });
    const ids = mapa.body.incidentes.map((i: { id: number }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([primero.incidenteId, res.body.incidenteNuevo.id]));
  });

  it('en un principal con unidos, cuenta también los reportes de los unidos (#54)', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
    await reportar('MODERADA', '2026-10-12T10:00:00Z');
    const delUnido = await reportar('MODERADA', '2026-10-11T10:00:00Z', 1);
    expect(delUnido.incidenteId).not.toBe(primero.incidenteId);
    await prisma.incidente.update({
      where: { id: delUnido.incidenteId },
      data: { incidentePrincipalId: primero.incidenteId },
    });

    const res = await separar(primero.id);

    expect(res.status).toBe(200);
    // El primer reporte que le queda es el del unido, no el otro propio.
    expect(await incidente(primero.incidenteId)).toMatchObject({
      primerReporteEn: new Date('2026-10-11T10:00:00Z'),
    });
  });

  describe('no separa', () => {
    it('un reporte de un incidente unido a otro: primero hay que deshacer la unión', async () => {
      const principal = await reportar('MODERADA', '2026-10-10T10:00:00Z');
      const delUnido = await reportar('MODERADA', '2026-10-11T10:00:00Z', 1);
      await reportar('MODERADA', '2026-10-12T10:00:00Z', 1);
      await prisma.incidente.update({
        where: { id: delUnido.incidenteId },
        data: { incidentePrincipalId: principal.incidenteId },
      });

      const res = await separar(delUnido.id);

      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        codigo: 'INCIDENTE_UNIDO',
        mensaje: `El incidente está unido al #${principal.incidenteId}: primero hay que deshacer la unión`,
      });
      const reporte = await prisma.reporte.findUniqueOrThrow({ where: { id: delUnido.id } });
      expect(reporte.incidenteId).toBe(delUnido.incidenteId);
    });

    it('el único reporte de un incidente', async () => {
      const unico = await reportar('MODERADA', '2026-10-10T10:00:00Z');

      const res = await separar(unico.id);

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('UNICO_REPORTE');
      expect(await incidente(unico.incidenteId)).toMatchObject({ cantidadReportes: 1 });
    });

    it('el único reporte válido, aunque el incidente tenga otros desestimados', async () => {
      const valido = await reportar('MODERADA', '2026-10-10T10:00:00Z');
      const otro = await reportar('MODERADA', '2026-10-11T10:00:00Z');
      await prisma.reporte.update({ where: { id: otro.id }, data: { estadoVerificacion: 'DESESTIMADO' } });

      const res = await separar(valido.id);

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('UNICO_REPORTE');
    });

    it('un reporte desestimado', async () => {
      await reportar('MODERADA', '2026-10-10T10:00:00Z');
      const desestimado = await reportar('MODERADA', '2026-10-11T10:00:00Z');
      await prisma.reporte.update({
        where: { id: desestimado.id },
        data: { estadoVerificacion: 'DESESTIMADO' },
      });

      const res = await separar(desestimado.id);

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('REPORTE_DESESTIMADO');
    });

    it('si el operador es de otro organismo', async () => {
      const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
      await reportar('MODERADA', '2026-10-11T10:00:00Z');
      const otro = await crearOperador((await crearOrganismo()).area);

      const res = await separar(primero.id, {}, otro.token);

      expect(res.status).toBe(403);
      expect(await incidente(primero.incidenteId)).toMatchObject({ cantidadReportes: 2 });
    });

    it('si lo pide un vecino', async () => {
      const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
      const vecino = await crearUsuario({ rol: 'VECINO' });

      const res = await separar(primero.id, {}, crearTokenAcceso(vecino));

      expect(res.status).toBe(403);
    });

    it('un reporte que no existe', async () => {
      const res = await separar(2_000_000_000);

      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('REPORTE_NO_ENCONTRADO');
    });

    it('con un comentario de más de 1000 caracteres', async () => {
      const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
      await reportar('MODERADA', '2026-10-11T10:00:00Z');

      const res = await separar(primero.id, { comentario: 'x'.repeat(1001) });

      expect(res.status).toBe(400);
    });
  });
});
