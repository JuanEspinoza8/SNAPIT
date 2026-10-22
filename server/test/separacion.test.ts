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
 * Un reporte en el punto del test. La foto es lisa: su hash no cuenta como foto repetida. Desde la web, sin
 * EXIF, queda pendiente; con la cámara de la app (`desdeLaApp`) se verifica sola (50 + 15). Todos los del
 * mismo test caen en el mismo incidente: misma categoría, mismo punto (#53).
 */
async function reportar(
  severidad: Severidad,
  registradoEn: string,
  cuadra = 0,
  opciones: { desdeLaApp?: boolean; corrimiento?: number; enCategoria?: Categoria } = {},
) {
  const { desdeLaApp = false, corrimiento = 0, enCategoria = categoria } = opciones;
  const vecino = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(vecino.id);
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(enCategoria.id))
    .field('severidadDeclarada', severidad)
    // Otra cuadra (unos 110 m por cada una) ya no se agrupa: es otro incidente. El corrimiento, en grados,
    // mueve el punto dentro de la misma cuadra.
    .field('lat', String(lat - cuadra * 0.001 - corrimiento))
    .field('lon', '-68.06')
    .field('origen', desdeLaApp ? 'APP_MOVIL' : 'SITIO_WEB')
    .field('tomadaConCamaraApp', String(desdeLaApp))
    .field('registradoEn', registradoEn)
    .attach('foto', await jpegLiso(128), 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number };
}

const separar = (id: number, cuerpo: object = {}, conToken = token) =>
  request(app).post(`/api/reportes/${id}/separacion`).set('Authorization', `Bearer ${conToken}`).send(cuerpo);

const incidente = (id: number) => prisma.incidente.findUniqueOrThrow({ where: { id } });

async function puntoDe(incidenteId: number) {
  const [punto] = await prisma.$queryRaw<{ lat: number; lon: number }[]>`
    SELECT ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lon FROM incidente WHERE id = ${incidenteId}`;
  return punto!;
}

// PostGIS puede devolver la coordenada con un error en el último decimal: alcanza con que coincidan al milímetro.
const cerca = (latEsperada: number) => ({
  lat: expect.closeTo(latEsperada, 8),
  lon: expect.closeTo(-68.06, 8),
});

const cambiosDeEstado = (incidenteId: number) =>
  prisma.movimientoIncidente.findMany({
    where: { incidenteId, tipo: 'CAMBIO_ESTADO' },
    orderBy: { id: 'asc' },
  });

/** Une con la API (#54), para que el principal sume los contadores del duplicado como en la realidad. */
async function unir(duplicadoId: number, principalId: number) {
  const res = await request(app)
    .post(`/api/incidentes/${duplicadoId}/union`)
    .set('Authorization', `Bearer ${token}`)
    .send({ principalId });
  expect(res.status).toBe(200);
}

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

  it('el único reporte verificado se lleva el estado: el nuevo pasa a VERIFICADO y el original vuelve a REGISTRADO', async () => {
    const verificado = await reportar('MODERADA', '2026-10-10T10:00:00Z', 0, { desdeLaApp: true });
    await reportar('MODERADA', '2026-10-11T10:00:00Z');
    expect(await incidente(verificado.incidenteId)).toMatchObject({
      estado: 'VERIFICADO',
      cantidadReportes: 2,
    });

    const res = await separar(verificado.id);

    expect(res.status).toBe(200);
    const nuevoId = res.body.incidenteNuevo.id;
    expect(res.body.incidenteNuevo.estado).toBe('VERIFICADO');
    expect(res.body.incidenteOriginal.estado).toBe('REGISTRADO');
    // Los dos cambios quedan en la bitácora como cambios del sistema, después de la SEPARACION.
    expect(await cambiosDeEstado(nuevoId)).toEqual([
      expect.objectContaining({ estadoAnterior: 'REGISTRADO', estadoNuevo: 'VERIFICADO', usuarioId: null }),
    ]);
    expect((await cambiosDeEstado(verificado.incidenteId)).at(-1)).toMatchObject({
      estadoAnterior: 'VERIFICADO',
      estadoNuevo: 'REGISTRADO',
      usuarioId: null,
    });
  });

  it('si al original le queda otro reporte verificado, sigue VERIFICADO', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z', 0, { desdeLaApp: true });
    await reportar('MODERADA', '2026-10-11T10:00:00Z', 0, { desdeLaApp: true });

    const res = await separar(primero.id);

    expect(res.status).toBe(200);
    expect(res.body.incidenteOriginal.estado).toBe('VERIFICADO');
    expect(res.body.incidenteNuevo.estado).toBe('VERIFICADO');
  });

  it('si se separa el reporte que ubicó al incidente, el original pasa al punto del siguiente', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
    // A unos 5 m: se agrupa con el primero, pero en otro punto.
    const segundo = await reportar('MODERADA', '2026-10-11T10:00:00Z', 0, { corrimiento: 0.00005 });
    expect(segundo.incidenteId).toBe(primero.incidenteId);
    await prisma.reporte.update({ where: { id: segundo.id }, data: { direccion: 'Belgrano 200, Centro' } });

    const res = await separar(primero.id);

    expect(res.status).toBe(200);
    expect(await puntoDe(primero.incidenteId)).toEqual(cerca(lat - 0.00005));
    expect((await incidente(primero.incidenteId)).direccion).toBe('Belgrano 200, Centro');
    expect(await puntoDe(res.body.incidenteNuevo.id)).toEqual(cerca(lat));
  });

  it('si se separa otro reporte, el original se queda donde está', async () => {
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z');
    const segundo = await reportar('MODERADA', '2026-10-11T10:00:00Z', 0, { corrimiento: 0.00005 });

    await separar(segundo.id);

    expect(await puntoDe(primero.incidenteId)).toEqual(cerca(lat));
  });

  it('el incidente nuevo toma la vigencia de su categoría, contada desde que llegó el reporte', async () => {
    const temporal = await prisma.categoria.create({
      data: {
        nombre: `Obra ${randomUUID()}`,
        areaId: categoria.areaId,
        tipoVigenciaDefault: 'TEMPORAL',
        diasCaducidadDefault: 10,
      },
    });
    const primero = await reportar('MODERADA', '2026-10-10T10:00:00Z', 0, { enCategoria: temporal });
    await reportar('MODERADA', '2026-10-11T10:00:00Z', 0, { enCategoria: temporal });
    // El original se renovó (F12): el nuevo no se queda con esa renovación.
    await prisma.incidente.update({
      where: { id: primero.incidenteId },
      data: { vigenteHasta: new Date('2027-01-01T00:00:00Z') },
    });

    const res = await separar(primero.id);

    const { sincronizadoEn } = await prisma.reporte.findUniqueOrThrow({ where: { id: primero.id } });
    expect(await incidente(res.body.incidenteNuevo.id)).toMatchObject({
      tipoVigencia: 'TEMPORAL',
      vigenteHasta: new Date(sincronizadoEn!.getTime() + 10 * 24 * 60 * 60 * 1000),
    });
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
    await unir(delUnido.incidenteId, primero.incidenteId);

    const res = await separar(primero.id);

    expect(res.status).toBe(200);
    // El primer reporte que le queda es el del unido, no el otro propio. Le quedan el propio y el del unido.
    expect(await incidente(primero.incidenteId)).toMatchObject({
      primerReporteEn: new Date('2026-10-11T10:00:00Z'),
      cantidadReportes: 2,
    });
  });

  describe('no separa', () => {
    it('un reporte de un incidente unido a otro: primero hay que deshacer la unión', async () => {
      const principal = await reportar('MODERADA', '2026-10-10T10:00:00Z');
      const delUnido = await reportar('MODERADA', '2026-10-11T10:00:00Z', 1);
      await reportar('MODERADA', '2026-10-12T10:00:00Z', 1);
      await unir(delUnido.incidenteId, principal.incidenteId);

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

    it('el único reporte propio de un principal, aunque tenga unidos: al deshacer quedaría vacío', async () => {
      const principal = await reportar('MODERADA', '2026-10-10T10:00:00Z');
      const delUnido = await reportar('MODERADA', '2026-10-11T10:00:00Z', 1);
      await reportar('MODERADA', '2026-10-12T10:00:00Z', 1);
      await unir(delUnido.incidenteId, principal.incidenteId);

      const res = await separar(principal.id);

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('UNICO_REPORTE');
      expect(await incidente(principal.incidenteId)).toMatchObject({ cantidadReportes: 3 });
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
