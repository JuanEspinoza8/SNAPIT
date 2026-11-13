import { randomUUID } from 'node:crypto';
import type { Area, Categoria, EstadoIncidente, EstadoVerificacion } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearOrganismoDePrueba, crearUsuario, tokenDe } from './apoyo.js';

/*
 * Un organismo con dos áreas, A y B, y una categoría en cada una (X en A, Y en B), con incidentes y reportes
 * cargados a mano en enero de 2026 (hora de Argentina). Cada resultado esperado se calculó de antemano a partir
 * de estos datos. Las semanas empiezan el lunes: 5, 12, 19 y 26 de enero.
 */

let areaA: Area;
let areaB: Area;
let x: Categoria;
let y: Categoria;
let token: string;
let tokenAdmin: string;
let otroOrganismoAreaId: number;

const incidentes: number[] = [];
const vecinos: number[] = [];
const ubicaciones = new Map<number, { lat: number; lon: number }>();
let ids: Record<string, number> = {};

afterAll(async () => {
  await prisma.reporte.deleteMany({ where: { usuarioId: { in: vecinos } } });
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
});

const ART = (fechaHora: string) => `${fechaHora}-03:00`;

/** Un incidente insertado directo, cada uno en su punto, cerca de (0, 0): lejos de los de otros tests. */
async function incidente(
  categoria: Categoria,
  datos: {
    estado?: EstadoIncidente;
    areaId?: number;
    primerReporteEn: string;
    resueltoEn?: string;
    direccion?: string;
    principalId?: number;
    temporalHasta?: string;
    caducadoEn?: string;
    puntaje?: number;
    prioridadManual?: number;
  },
) {
  const lat = -0.001 * (incidentes.length + 1);
  const lon = 0.002;
  const [fila] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, area_id, estado, ubicacion, direccion, tipo_vigencia, vigente_hasta,
                           caducado_en, puntaje_prioridad, prioridad_manual, motivo_prioridad_manual,
                           primer_reporte_en, resuelto_en, incidente_principal_id)
    VALUES (${categoria.id}, ${datos.areaId ?? null}, ${datos.estado ?? 'VERIFICADO'}::estado_incidente,
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${datos.direccion ?? null},
            ${datos.temporalHasta ? 'TEMPORAL' : 'PERMANENTE'}::tipo_vigencia,
            ${datos.temporalHasta ? ART(datos.temporalHasta) : null}::timestamptz,
            ${datos.caducadoEn ? ART(datos.caducadoEn) : null}::timestamptz,
            ${datos.puntaje ?? 0}, ${datos.prioridadManual ?? null},
            ${datos.prioridadManual === undefined ? null : 'Ajuste de prueba'},
            ${ART(datos.primerReporteEn)}::timestamptz,
            ${datos.resueltoEn ? ART(datos.resueltoEn) : null}::timestamptz, ${datos.principalId ?? null})
    RETURNING id`;
  incidentes.push(fila!.id);
  ubicaciones.set(fila!.id, { lat, lon });
  return fila!.id;
}

async function reporte(incidenteId: number, estado: EstadoVerificacion, registradoEn: string) {
  const vecino = await crearUsuario();
  vecinos.push(vecino.id);
  const { categoriaId } = await prisma.incidente.findUniqueOrThrow({ where: { id: incidenteId } });
  await prisma.$executeRaw`
    INSERT INTO reporte (incidente_id, usuario_id, categoria_id, severidad_declarada, ubicacion, origen,
                         estado_verificacion, registrado_en)
    VALUES (${incidenteId}, ${vecino.id}, ${categoriaId}, 'MODERADA',
            ST_SetSRID(ST_MakePoint(0.002, 0), 4326)::geography, 'APP_MOVIL',
            ${estado}::estado_verificacion, ${ART(registradoEn)}::timestamptz)`;
}

beforeAll(async () => {
  const prueba = await crearOrganismoDePrueba();
  areaA = prueba.area;
  x = prueba.categoria;
  const organismoId = areaA.organismoId;
  areaB = await prisma.area.create({ data: { organismoId, nombre: `Veredas ${randomUUID()}` } });
  y = await prisma.categoria.create({ data: { nombre: `Vereda rota ${randomUUID()}`, areaId: areaB.id } });
  const otro = await crearOrganismoDePrueba();
  otroOrganismoAreaId = otro.area.id;

  // Un operador del área A: sin areaId, igual ve todo el organismo.
  token = crearTokenAcceso(await crearUsuario({ rol: 'OPERADOR', organismoId, areaId: areaA.id }));
  tokenAdmin = crearTokenAcceso(await crearUsuario({ rol: 'ADMINISTRADOR', organismoId }));

  // Abiertos. a3 entra el domingo 11 a las 23:30 de acá: en UTC ya es lunes, pero es de la semana del 5.
  const a1 = await incidente(x, {
    estado: 'REGISTRADO',
    primerReporteEn: '2026-01-05T10:00:00',
    direccion: 'Lanín 100, Centro',
    puntaje: 20,
  });
  const a2 = await incidente(x, {
    primerReporteEn: '2026-01-06T10:00:00',
    direccion: 'Lanín 200, Centro',
    puntaje: 40,
  });
  const a3 = await incidente(y, {
    primerReporteEn: '2026-01-11T23:30:00',
    direccion: 'Roca 50, Bouquet Roldán',
    puntaje: 30,
    prioridadManual: 80,
  });
  // De la categoría X (área A), pero derivado al área B: cuenta en B. Todavía sin dirección.
  const a4 = await incidente(x, {
    estado: 'DERIVADO',
    areaId: areaB.id,
    primerReporteEn: '2026-01-12T00:10:00',
    puntaje: 12,
  });
  const a5 = await incidente(x, {
    estado: 'EN_EJECUCION',
    areaId: areaA.id,
    primerReporteEn: '2026-01-27T09:00:00',
    direccion: 'Alem 10, Villa Farrell',
    puntaje: 60,
  });
  // Abierto, pero reportado antes del período.
  const p1 = await incidente(x, {
    primerReporteEn: '2025-12-20T10:00:00',
    direccion: 'Lanín 400, Centro',
    puntaje: 10,
  });

  // Resueltos: 4, 2, 9, 1 y 4 días. r1 se reportó antes del período, pero se resolvió adentro; r6, al revés.
  const resuelto = (categoria: Categoria, areaId: number, primer: string, fin: string, direccion?: string) =>
    incidente(categoria, { estado: 'RESUELTO', areaId, primerReporteEn: primer, resueltoEn: fin, direccion });
  const r1 = await resuelto(x, areaA.id, '2026-01-02T10:00:00', '2026-01-06T10:00:00', 'Lanín 300, Centro');
  const r2 = await resuelto(x, areaA.id, '2026-01-05T08:00:00', '2026-01-07T08:00:00', 'Lanín 500, Centro');
  const r3 = await resuelto(
    x,
    areaB.id,
    '2026-01-06T12:00:00',
    '2026-01-15T12:00:00',
    'Roca 70, Bouquet Roldán',
  );
  const r4 = await resuelto(y, areaB.id, '2026-01-13T09:00:00', '2026-01-14T09:00:00');
  const r5 = await resuelto(
    y,
    areaB.id,
    '2026-01-14T09:00:00',
    '2026-01-18T09:00:00',
    'Roca 90, Bouquet Roldán',
  );
  const r6 = await resuelto(x, areaA.id, '2026-01-27T09:00:00', '2026-02-06T09:00:00', 'Lanín 600, Centro');

  // Los que no cuentan como abiertos (ni como nuevos, los unidos y el desestimado).
  const d1 = await incidente(x, { estado: 'DESESTIMADO', primerReporteEn: '2026-01-07T10:00:00' });
  // De la categoría Y (área B), pero unido a a2 (área A): lo suyo cuenta en A.
  const u1 = await incidente(y, { primerReporteEn: '2026-01-08T10:00:00', principalId: a2 });
  const ru = await incidente(x, {
    estado: 'RESUELTO',
    areaId: areaA.id,
    primerReporteEn: '2026-01-05T10:00:00',
    resueltoEn: '2026-01-20T10:00:00',
    principalId: r1,
  });
  const c1 = await incidente(x, {
    primerReporteEn: '2026-01-09T10:00:00',
    temporalHasta: '2026-01-15T00:00:00',
    caducadoEn: '2026-01-15T00:00:00',
    puntaje: 50,
  });
  // Vencido, pero la tarea diaria todavía no lo marcó.
  const v1 = await incidente(x, {
    primerReporteEn: '2026-01-10T10:00:00',
    temporalHasta: '2026-01-16T00:00:00',
    puntaje: 50,
  });

  // Del otro organismo.
  const o1 = await incidente(otro.categoria, { primerReporteEn: '2026-01-06T10:00:00', puntaje: 99 });
  await incidente(otro.categoria, {
    estado: 'RESUELTO',
    primerReporteEn: '2026-01-06T10:00:00',
    resueltoEn: '2026-01-08T10:00:00',
  });

  // Reportes: 5 del organismo en el período, 3 desestimados.
  await reporte(a1, 'VERIFICADO', '2026-01-05T10:00:00');
  await reporte(a2, 'DESESTIMADO', '2026-01-06T10:00:00');
  await reporte(u1, 'PENDIENTE_REVISION', '2026-01-08T10:00:00');
  await reporte(a3, 'DESESTIMADO', '2026-01-11T10:00:00');
  await reporte(d1, 'DESESTIMADO', '2026-01-07T10:00:00');
  await reporte(o1, 'DESESTIMADO', '2026-01-06T10:00:00');
  await reporte(a1, 'VERIFICADO', '2025-12-20T10:00:00');

  ids = { a1, a2, a3, a4, a5, p1, r1, r2, r3, r4, r5, r6, d1, u1, ru, c1, v1, o1 };
});

const ENERO = { desde: '2026-01-05', hasta: '2026-02-01' };

const indicadores = (consulta: Record<string, string> = {}, conToken = token) =>
  request(app).get('/api/indicadores').query(consulta).set('Authorization', `Bearer ${conToken}`);

const calor = (consulta: Record<string, string> = {}, conToken = token) =>
  request(app).get('/api/indicadores/calor').query(consulta).set('Authorization', `Bearer ${conToken}`);

const abiertos = (registrado: number, verificado: number, derivado: number, enEjecucion: number) => [
  { estado: 'REGISTRADO', cantidad: registrado },
  { estado: 'VERIFICADO', cantidad: verificado },
  { estado: 'DERIVADO', cantidad: derivado },
  { estado: 'EN_EJECUCION', cantidad: enEjecucion },
];

const punto = (nombre: string, peso: number) => ({ ...ubicaciones.get(ids[nombre]!)!, peso });

/** El lunes de esta semana en hora de Argentina, como 2026-11-09. */
function lunesDeEstaSemana() {
  const aca = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const desdeElLunes = (aca.getUTCDay() + 6) % 7;
  return new Date(aca.getTime() - desdeElLunes * 86_400_000).toISOString().slice(0, 10);
}

describe('GET /api/indicadores', () => {
  it('calcula cada indicador del período con los valores conocidos de antemano', async () => {
    const res = await indicadores(ENERO);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      // a1; a2 y a3; a4; a5. Ni p1 (antes del período), ni el unido, el caducado, el vencido o los cerrados.
      abiertosPorEstado: abiertos(1, 2, 1, 1),
      nuevosYResueltosPorSemana: [
        // a1, a2, a3, r2, r3, c1 y v1 (sin d1, u1 ni ru); se resolvieron r1 y r2.
        { semana: '2026-01-05', nuevos: 7, resueltos: 2 },
        { semana: '2026-01-12', nuevos: 3, resueltos: 3 },
        { semana: '2026-01-19', nuevos: 0, resueltos: 0 },
        // r6 se resolvió después del período.
        { semana: '2026-01-26', nuevos: 2, resueltos: 0 },
      ],
      tiempoDeResolucion: {
        porCategoria: [
          { id: x.id, nombre: x.nombre, cantidad: 3, medianaDias: 4, promedioDias: 5 },
          { id: y.id, nombre: y.nombre, cantidad: 2, medianaDias: 2.5, promedioDias: 2.5 },
        ],
        porArea: [
          { id: areaB.id, nombre: areaB.nombre, cantidad: 3, medianaDias: 4, promedioDias: 4.7 },
          { id: areaA.id, nombre: areaA.nombre, cantidad: 2, medianaDias: 3, promedioDias: 3 },
        ],
        // r4 no tiene dirección: no entra en ningún barrio.
        porBarrio: [
          { barrio: 'Bouquet Roldán', cantidad: 2, medianaDias: 6.5, promedioDias: 6.5 },
          { barrio: 'Centro', cantidad: 2, medianaDias: 3, promedioDias: 3 },
        ],
      },
      barriosConMasAbiertos: [
        { barrio: 'Centro', cantidad: 2 },
        { barrio: 'Bouquet Roldán', cantidad: 1 },
        { barrio: 'Villa Farrell', cantidad: 1 },
      ],
      reportesDesestimados: { total: 5, desestimados: 3, porcentaje: 60 },
    });
  });

  it('con areaId, solo lo de esa área: la derivada, o la de su categoría si todavía no se derivó', async () => {
    const res = await indicadores({ ...ENERO, areaId: String(areaB.id) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      abiertosPorEstado: abiertos(0, 1, 1, 0),
      nuevosYResueltosPorSemana: [
        { semana: '2026-01-05', nuevos: 2, resueltos: 0 },
        { semana: '2026-01-12', nuevos: 3, resueltos: 3 },
        { semana: '2026-01-19', nuevos: 0, resueltos: 0 },
        { semana: '2026-01-26', nuevos: 0, resueltos: 0 },
      ],
      tiempoDeResolucion: {
        porCategoria: [
          { id: x.id, nombre: x.nombre, cantidad: 1, medianaDias: 9, promedioDias: 9 },
          { id: y.id, nombre: y.nombre, cantidad: 2, medianaDias: 2.5, promedioDias: 2.5 },
        ],
        porArea: [{ id: areaB.id, nombre: areaB.nombre, cantidad: 3, medianaDias: 4, promedioDias: 4.7 }],
        porBarrio: [{ barrio: 'Bouquet Roldán', cantidad: 2, medianaDias: 6.5, promedioDias: 6.5 }],
      },
      barriosConMasAbiertos: [{ barrio: 'Bouquet Roldán', cantidad: 1 }],
      reportesDesestimados: { total: 1, desestimados: 1, porcentaje: 100 },
    });
  });

  it('el reporte de un incidente unido cuenta en el área del principal', async () => {
    // u1 es de la categoría Y (área B), pero está unido a a2 (área A).
    const res = await indicadores({ ...ENERO, areaId: String(areaA.id) });
    expect(res.body.reportesDesestimados).toEqual({ total: 4, desestimados: 2, porcentaje: 50 });
  });

  it('sin período: todos los abiertos, y las semanas van del dato más viejo a la actual', async () => {
    const res = await indicadores();
    expect(res.status).toBe(200);
    expect(res.body.abiertosPorEstado).toEqual(abiertos(1, 3, 1, 1));
    expect(res.body.reportesDesestimados).toEqual({ total: 6, desestimados: 3, porcentaje: 50 });

    const semanas: { semana: string; nuevos: number; resueltos: number }[] =
      res.body.nuevosYResueltosPorSemana;
    // p1 entró el sábado 20 de diciembre: la semana del lunes 15.
    expect(semanas[0]).toEqual({ semana: '2025-12-15', nuevos: 1, resueltos: 0 });
    expect(semanas.at(-1)!.semana).toBe(lunesDeEstaSemana());
    for (let i = 1; i < semanas.length; i++) {
      const dias = (Date.parse(semanas[i]!.semana) - Date.parse(semanas[i - 1]!.semana)) / 86_400_000;
      expect(dias).toBe(7);
    }
    // Los 14 incidentes que no son unidos ni desestimados, y los 6 resueltos (ru está unido).
    expect(semanas.reduce((suma, s) => suma + s.nuevos, 0)).toBe(14);
    expect(semanas.reduce((suma, s) => suma + s.resueltos, 0)).toBe(6);
    expect(semanas.find((s) => s.semana === '2026-02-02')).toEqual({
      semana: '2026-02-02',
      nuevos: 0,
      resueltos: 1,
    });

    expect(res.body.tiempoDeResolucion.porCategoria[0]).toMatchObject({ id: x.id, cantidad: 4 });
  });

  it('solo con hasta: las semanas arrancan en la del dato más viejo y terminan en la de hasta', async () => {
    const res = await indicadores({ hasta: '2026-01-11' });
    expect(res.body.nuevosYResueltosPorSemana).toEqual([
      { semana: '2025-12-15', nuevos: 1, resueltos: 0 },
      { semana: '2025-12-22', nuevos: 0, resueltos: 0 },
      { semana: '2025-12-29', nuevos: 1, resueltos: 0 },
      // Hasta el domingo 11 a las 23:59 de acá: entra a3.
      { semana: '2026-01-05', nuevos: 7, resueltos: 2 },
    ]);
  });

  it('solo con desde: las semanas terminan en la actual', async () => {
    const res = await indicadores({ desde: '2026-01-26' });
    const semanas = res.body.nuevosYResueltosPorSemana;
    expect(semanas.slice(0, 2)).toEqual([
      { semana: '2026-01-26', nuevos: 2, resueltos: 0 },
      { semana: '2026-02-02', nuevos: 0, resueltos: 1 },
    ]);
    expect(semanas.at(-1).semana).toBe(lunesDeEstaSemana());
  });

  it('un período sin datos da ceros, semanas en 0 y porcentaje null', async () => {
    // El 1 de enero de 2030 es martes: la primera semana es la del lunes 31 de diciembre.
    const res = await indicadores({ desde: '2030-01-01', hasta: '2030-01-14' });
    expect(res.body).toEqual({
      abiertosPorEstado: abiertos(0, 0, 0, 0),
      nuevosYResueltosPorSemana: [
        { semana: '2029-12-31', nuevos: 0, resueltos: 0 },
        { semana: '2030-01-07', nuevos: 0, resueltos: 0 },
        { semana: '2030-01-14', nuevos: 0, resueltos: 0 },
      ],
      tiempoDeResolucion: { porCategoria: [], porArea: [], porBarrio: [] },
      barriosConMasAbiertos: [],
      reportesDesestimados: { total: 0, desestimados: 0, porcentaje: null },
    });
  });

  it('un administrador ve lo mismo que el operador de su organismo', async () => {
    const [deOperador, deAdmin] = await Promise.all([indicadores(ENERO), indicadores(ENERO, tokenAdmin)]);
    expect(deAdmin.status).toBe(200);
    expect(deAdmin.body).toEqual(deOperador.body);
  });

  it('un administrador sin organismo recibe todo vacío', async () => {
    const res = await indicadores(ENERO, await tokenDe('ADMINISTRADOR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      abiertosPorEstado: abiertos(0, 0, 0, 0),
      nuevosYResueltosPorSemana: [],
      tiempoDeResolucion: { porCategoria: [], porArea: [], porBarrio: [] },
      barriosConMasAbiertos: [],
      reportesDesestimados: { total: 0, desestimados: 0, porcentaje: null },
    });
  });
});

describe('GET /api/indicadores/calor', () => {
  it('los abiertos del período, con su prioridad sobre la mayor: la manual manda', async () => {
    const res = await calor(ENERO);
    expect(res.status).toBe(200);
    // Prioridades 20, 40, 80 (manual; la calculada es 30), 12 y 60.
    expect(res.body).toEqual({
      puntos: [punto('a1', 0.25), punto('a2', 0.5), punto('a3', 1), punto('a4', 0.15), punto('a5', 0.75)],
    });
  });

  it('con areaId y sin período', async () => {
    expect((await calor({ areaId: String(areaB.id) })).body).toEqual({
      puntos: [punto('a3', 1), punto('a4', 0.15)],
    });
    // Sin período entra p1 (10 sobre 80).
    expect((await calor()).body.puntos).toContainEqual(punto('p1', 0.13));
    expect((await calor()).body.puntos).toHaveLength(6);
  });

  it('un administrador sin organismo recibe una lista vacía', async () => {
    const res = await calor(ENERO, await tokenDe('ADMINISTRADOR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ puntos: [] });
  });
});

describe.each(['', '/calor'])('permisos y filtros de GET /api/indicadores%s', (ruta) => {
  const pedir = (consulta: Record<string, string>, conToken?: string) => {
    const pedido = request(app).get(`/api/indicadores${ruta}`).query(consulta);
    return conToken ? pedido.set('Authorization', `Bearer ${conToken}`) : pedido;
  };

  it('sin sesión responde 401 y un vecino recibe 403', async () => {
    expect((await pedir({})).status).toBe(401);
    const res = await pedir({}, await tokenDe('VECINO'));
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('un área de otro organismo responde 400', async () => {
    const res = await pedir({ areaId: String(otroOrganismoAreaId) }, token);
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'areaId', mensaje: 'No es un área de tu organismo' }]);
  });

  it('fechas inválidas o hasta antes de desde responden 400', async () => {
    let res = await pedir({ desde: 'ayer', areaId: 'todas' }, token);
    expect(res.status).toBe(400);
    expect(res.body.error.detalles.map((d: { campo: string }) => d.campo).sort()).toEqual([
      'areaId',
      'desde',
    ]);

    res = await pedir({ desde: '2026-02-01', hasta: '2026-01-05' }, token);
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'hasta', mensaje: 'No puede ser anterior a desde' }]);
  });
});
