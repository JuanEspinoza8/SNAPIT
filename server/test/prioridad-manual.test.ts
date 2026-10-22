import { randomUUID } from 'node:crypto';
import { type Area, type Categoria, Prisma, type Severidad, type Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { PRIORIDAD_EFECTIVA } from '../src/modulos/prioridad/repositorio.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { fotoUnica, jpegSinExif } from './imagenes.js';

// La dirección no se consulta: no hace falta para la prioridad.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;
// Cada test en su propio lugar, lejos de los puntos de interés de otros tests (cerca de −68,06 y −68,45):
// así el contexto urbano suma 0 y la prioridad calculada se conoce de antemano.
let lat: number;
const lon = -68.4;

beforeEach(async () => {
  const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
  area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id, pesoSeveridadBase: '1.50' },
  });
  operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });
  token = crearTokenAcceso(operador);
  lat = -38.9 - Math.random() * 0.2;
});

/**
 * Un reporte en la cuadra `cuadra` del lugar del test (cada una a unos 110 m: no se agrupan entre sí). Con la
 * cámara de la app queda verificado (50 + 15) y el incidente pasa a VERIFICADO; desde la galería sin EXIF
 * queda pendiente (50 − 10) y el incidente sigue REGISTRADO.
 */
async function reportar(opciones: { severidad?: Severidad; cuadra?: number; pendiente?: boolean } = {}) {
  const vecino = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(vecino.id);
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(categoria.id))
    .field('severidadDeclarada', opciones.severidad ?? 'MODERADA')
    .field('lat', String(lat - (opciones.cuadra ?? 0) * 0.001))
    .field('lon', String(lon))
    .field('origen', 'APP_MOVIL')
    .field('tomadaConCamaraApp', String(!opciones.pendiente))
    .attach('foto', await fotoUnica(jpegSinExif()), 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body.incidenteId as number;
}

const fijar = (id: number, cuerpo: object, conToken = token) =>
  request(app)
    .put(`/api/incidentes/${id}/prioridad-manual`)
    .set('Authorization', `Bearer ${conToken}`)
    .send(cuerpo);

const quitar = (id: number, conToken = token) =>
  request(app).delete(`/api/incidentes/${id}/prioridad-manual`).set('Authorization', `Bearer ${conToken}`);

const ajuste = (id: number) =>
  prisma.incidente.findUniqueOrThrow({
    where: { id },
    select: {
      puntajePrioridad: true,
      prioridadManual: true,
      motivoPrioridadManual: true,
      ajustadaPorId: true,
    },
  });

const factores = (id: number) =>
  prisma.factorPrioridad.findMany({
    where: { incidenteId: id },
    select: { factor: true, valor: true, detalle: true },
    orderBy: { id: 'asc' },
  });

const movimientos = (id: number) =>
  prisma.movimientoIncidente.findMany({
    where: { incidenteId: id, tipo: 'AJUSTE_PRIORIDAD' },
    select: { usuarioId: true, comentario: true },
    orderBy: { id: 'asc' },
  });

/** Los incidentes en el orden de la bandeja: primero el de mayor prioridad. */
async function ordenBandeja(ids: number[]) {
  const filas = await prisma.$queryRaw<{ id: number }[]>`
    SELECT i.id FROM incidente i
    WHERE i.id IN (${Prisma.join(ids)})
    ORDER BY ${PRIORIDAD_EFECTIVA} DESC, i.id`;
  return filas.map((fila) => fila.id);
}

describe('PUT /api/incidentes/:id/prioridad-manual', () => {
  it('fija la prioridad con su motivo y autor; el puntaje sigue siendo el calculado y el desglose suma la diferencia', async () => {
    const id = await reportar();

    const res = await fijar(id, { valor: 80, motivo: '  obra programada  ' });

    expect(res.status).toBe(200);
    // MODERADA en una categoría de peso 1,5 con un reporte: 40 + 6,25.
    expect(res.body).toMatchObject({
      id,
      puntajePrioridad: 46.25,
      prioridadManual: 80,
      motivoPrioridadManual: 'obra programada',
      ajustadaPor: { id: operador.id, nombre: operador.nombre },
    });
    expect(res.body.factores).toHaveLength(5);
    expect(res.body.factores[4]).toEqual({
      factor: 'AJUSTE_MANUAL',
      valor: 33.75,
      detalle: `Ajuste manual de ${operador.nombre} (obra programada): +33,8`,
    });

    const guardado = await ajuste(id);
    expect(Number(guardado.puntajePrioridad)).toBe(46.25);
    expect(Number(guardado.prioridadManual)).toBe(80);
    expect(guardado).toMatchObject({ motivoPrioridadManual: 'obra programada', ajustadaPorId: operador.id });
    expect(await factores(id)).toHaveLength(5);
    expect(await movimientos(id)).toEqual([
      {
        usuarioId: operador.id,
        comentario: 'Prioridad fijada en 80 (la calculada es 46,25): obra programada',
      },
    ]);
  });

  it('un segundo ajuste reemplaza al primero: un solo AJUSTE_MANUAL y dos movimientos', async () => {
    const id = await reportar();
    await fijar(id, { valor: 80, motivo: 'obra programada' });
    const otro = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });

    const res = await fijar(id, { valor: 30.5, motivo: 'la obra se postergó' }, crearTokenAcceso(otro));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ prioridadManual: 30.5, ajustadaPor: { id: otro.id } });
    const manuales = (await factores(id)).filter((f) => f.factor === 'AJUSTE_MANUAL');
    expect(manuales.map((f) => ({ ...f, valor: Number(f.valor) }))).toEqual([
      {
        factor: 'AJUSTE_MANUAL',
        valor: -15.75,
        detalle: `Ajuste manual de ${otro.nombre} (la obra se postergó): −15,8`,
      },
    ]);
    expect((await movimientos(id)).map((m) => m.comentario)).toEqual([
      'Prioridad fijada en 80 (la calculada es 46,25): obra programada',
      'Prioridad fijada en 30,5 (la calculada es 46,25): la obra se postergó',
    ]);
  });

  it('acepta los extremos de la columna, 0 y 9999,99', async () => {
    const id = await reportar();

    expect((await fijar(id, { valor: 0, motivo: 'ya hay un desvío señalizado' })).body).toMatchObject({
      prioridadManual: 0,
    });
    expect((await fijar(id, { valor: 9999.99, motivo: 'riesgo para la escuela' })).body).toMatchObject({
      prioridadManual: 9999.99,
    });
  });

  it.each([
    ['sin motivo', { valor: 80 }, 'motivo', 'Es obligatorio'],
    ['con un motivo en blanco', { valor: 80, motivo: '   ' }, 'motivo', 'Es obligatorio'],
    [
      'con un motivo de más de 1000 caracteres',
      { valor: 80, motivo: 'a'.repeat(1001) },
      'motivo',
      'Tiene que tener hasta 1000 caracteres',
    ],
    ['sin valor', { motivo: 'obra programada' }, 'valor', 'Es obligatorio'],
    [
      'con un valor que no es un número',
      { valor: '80', motivo: 'obra programada' },
      'valor',
      'Tiene que ser un número',
    ],
    ['con un valor negativo', { valor: -1, motivo: 'obra programada' }, 'valor', 'No puede ser negativo'],
    [
      'con un valor que no entra en la columna',
      { valor: 10000, motivo: 'obra programada' },
      'valor',
      'Puede ser hasta 9999,99',
    ],
  ])('%s responde 400 y no cambia nada', async (_caso, cuerpo, campo, mensaje) => {
    const id = await reportar();

    const res = await fijar(id, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ codigo: 'DATOS_INVALIDOS', detalles: [{ campo, mensaje }] });
    expect(await ajuste(id)).toMatchObject({ prioridadManual: null, motivoPrioridadManual: null });
    expect(await movimientos(id)).toEqual([]);
  });

  it('un reporte que se suma después conserva el ajuste y recalcula la diferencia', async () => {
    const id = await reportar();
    await fijar(id, { valor: 80, motivo: 'obra programada' });

    expect(await reportar()).toBe(id);

    // Con dos reportes, las evidencias pasan de 6,25 a 25 × ln 3 / ln 16 = 9,91.
    const guardado = await ajuste(id);
    expect(Number(guardado.puntajePrioridad)).toBe(49.91);
    expect(Number(guardado.prioridadManual)).toBe(80);
    const manual = (await factores(id)).find((f) => f.factor === 'AJUSTE_MANUAL');
    expect(Number(manual?.valor)).toBe(30.09);
  });

  it('solo se ajustan incidentes verificados: uno REGISTRADO responde 409', async () => {
    const id = await reportar({ pendiente: true });

    const res = await fijar(id, { valor: 80, motivo: 'obra programada' });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INCIDENTE_NO_VERIFICADO');
    expect(await ajuste(id)).toMatchObject({ prioridadManual: null });
  });
});

describe('DELETE /api/incidentes/:id/prioridad-manual', () => {
  it('quita el ajuste: vuelve a la prioridad calculada, sin AJUSTE_MANUAL, y queda en la bitácora', async () => {
    const id = await reportar();
    await fijar(id, { valor: 80, motivo: 'obra programada' });

    const res = await quitar(id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      puntajePrioridad: 46.25,
      prioridadManual: null,
      motivoPrioridadManual: null,
      ajustadaPor: null,
    });
    expect(res.body.factores.map((f: { factor: string }) => f.factor)).toEqual([
      'SEVERIDAD',
      'EVIDENCIAS',
      'ANTIGUEDAD',
      'CONTEXTO_URBANO',
    ]);
    expect(await ajuste(id)).toMatchObject({
      prioridadManual: null,
      motivoPrioridadManual: null,
      ajustadaPorId: null,
    });
    expect((await movimientos(id)).map((m) => m.comentario)).toEqual([
      'Prioridad fijada en 80 (la calculada es 46,25): obra programada',
      'Se quitó la prioridad manual de 80: vuelve a la calculada, 46,25',
    ]);
  });

  it('sin ajuste responde 409 y no deja nada en la bitácora', async () => {
    const id = await reportar();

    const res = await quitar(id);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('SIN_PRIORIDAD_MANUAL');
    expect(await movimientos(id)).toEqual([]);
  });

  it('se puede quitar en un incidente que volvió a REGISTRADO', async () => {
    const id = await reportar({ pendiente: true });
    await prisma.incidente.update({
      where: { id },
      data: { prioridadManual: '80', motivoPrioridadManual: 'obra programada', ajustadaPorId: operador.id },
    });

    const res = await quitar(id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ prioridadManual: null });
  });
});

describe('orden de la bandeja (PRIORIDAD_EFECTIVA)', () => {
  it('el ajuste manual manda sobre el calculado, y al quitarlo el incidente vuelve a su lugar', async () => {
    // Con peso 1,5 y un reporte: GRAVE 66,25, MODERADA 46,25 y LEVE 26,25.
    const grave = await reportar({ severidad: 'GRAVE', cuadra: 0 });
    const moderada = await reportar({ severidad: 'MODERADA', cuadra: 1 });
    const leve = await reportar({ severidad: 'LEVE', cuadra: 2 });
    const ids = [grave, moderada, leve];
    expect(await ordenBandeja(ids)).toEqual([grave, moderada, leve]);

    await fijar(leve, { valor: 70, motivo: 'frente a la guardia del hospital' });
    expect(await ordenBandeja(ids)).toEqual([leve, grave, moderada]);

    await fijar(grave, { valor: 10, motivo: 'ya tiene un vallado' });
    expect(await ordenBandeja(ids)).toEqual([leve, moderada, grave]);

    await quitar(leve);
    await quitar(grave);
    expect(await ordenBandeja(ids)).toEqual([grave, moderada, leve]);
  });
});

describe('permisos y estados', () => {
  it('sin sesión responde 401 y un vecino 403', async () => {
    const id = await reportar();
    const vecino = await crearUsuario({ rol: 'VECINO' });

    expect((await request(app).put(`/api/incidentes/${id}/prioridad-manual`).send({})).status).toBe(401);
    expect((await fijar(id, { valor: 80, motivo: 'x' }, crearTokenAcceso(vecino))).status).toBe(403);
    expect((await quitar(id, crearTokenAcceso(vecino))).status).toBe(403);
  });

  it('un operador de otro organismo no lo puede ajustar ni quitar: 403', async () => {
    const id = await reportar();
    await fijar(id, { valor: 80, motivo: 'obra programada' });
    const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
    const otraArea = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Otra área' } });
    const ajeno = crearTokenAcceso(
      await crearUsuario({ rol: 'OPERADOR', organismoId: organismo.id, areaId: otraArea.id }),
    );

    const alFijar = await fijar(id, { valor: 10, motivo: 'no es mío' }, ajeno);
    const alQuitar = await quitar(id, ajeno);

    expect(alFijar.status).toBe(403);
    expect(alQuitar.status).toBe(403);
    expect(alQuitar.body.error.codigo).toBe('SIN_PERMISO');
    expect(Number((await ajuste(id)).prioridadManual)).toBe(80);
  });

  it('un incidente que no existe responde 404, y un id inválido 400', async () => {
    expect((await fijar(2_147_483_647, { valor: 80, motivo: 'x' })).status).toBe(404);
    expect((await quitar(2_147_483_647)).body.error.codigo).toBe('INCIDENTE_NO_ENCONTRADO');
    expect((await fijar(0, { valor: 80, motivo: 'x' })).status).toBe(400);
  });

  it.each([
    ['resuelto', { estado: 'RESUELTO', resueltoEn: new Date() }, 'INCIDENTE_CERRADO'],
    ['desestimado', { estado: 'DESESTIMADO' }, 'INCIDENTE_CERRADO'],
    ['caducado', { caducadoEn: new Date() }, 'INCIDENTE_CERRADO'],
  ] as const)('un incidente %s no se ajusta ni se quita: 409', async (_caso, cambio, codigo) => {
    const id = await reportar();
    await fijar(id, { valor: 80, motivo: 'obra programada' });
    await prisma.incidente.update({ where: { id }, data: cambio });

    const alFijar = await fijar(id, { valor: 10, motivo: 'otro' });
    const alQuitar = await quitar(id);

    expect(alFijar.status).toBe(409);
    expect(alFijar.body.error.codigo).toBe(codigo);
    expect(alQuitar.body.error.codigo).toBe(codigo);
    expect(Number((await ajuste(id)).prioridadManual)).toBe(80);
  });

  it('un incidente unido a otro no se ajusta: se ajusta el principal', async () => {
    const principal = await reportar({ cuadra: 0 });
    const duplicado = await reportar({ cuadra: 1 });
    await prisma.incidente.update({ where: { id: duplicado }, data: { incidentePrincipalId: principal } });

    const res = await fijar(duplicado, { valor: 80, motivo: 'obra programada' });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INCIDENTE_UNIDO');
    expect((await quitar(duplicado)).body.error.codigo).toBe('INCIDENTE_UNIDO');
  });
});
