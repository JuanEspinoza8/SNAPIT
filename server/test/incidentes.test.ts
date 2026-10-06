import { randomUUID } from 'node:crypto';
import type { EstadoIncidente } from '@prisma/client';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearUsuario } from './apoyo.js';

/**
 * Cada test trabaja en su propio cuadrado del planeta, lejos de Neuquén y de los otros tests:
 * así puede pedir "todo lo que hay en mi bbox" y saber exactamente qué tiene que volver.
 */
function zonaNueva() {
  const lon = -170 + Math.random() * 300;
  const lat = -60 + Math.random() * 110;
  return {
    punto: (dLon = 0, dLat = 0) => ({ lon: lon + dLon, lat: lat + dLat }),
    bbox: `${lon - 0.5},${lat - 0.5},${lon + 0.5},${lat + 0.5}`,
  };
}

async function crearCategoria() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  return prisma.categoria.create({ data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id } });
}

const creados: number[] = [];

async function crearIncidente(datos: {
  categoriaId: number;
  punto: { lon: number; lat: number };
  estado?: EstadoIncidente;
  primerReporteEn?: Date;
  caducadoEn?: Date | null;
  vigenteHasta?: Date | null;
  principalId?: number | null;
  cantidadReportes?: number;
}) {
  const {
    categoriaId,
    punto,
    estado = 'VERIFICADO',
    primerReporteEn = new Date('2026-10-01T12:00:00Z'),
    caducadoEn = null,
    vigenteHasta = null,
    principalId = null,
    cantidadReportes = 1,
  } = datos;
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, estado, ubicacion, primer_reporte_en, caducado_en,
                           tipo_vigencia, vigente_hasta, incidente_principal_id, cantidad_reportes)
    VALUES (${categoriaId}, ${estado}::estado_incidente,
            ST_SetSRID(ST_MakePoint(${punto.lon}, ${punto.lat}), 4326)::geography,
            ${primerReporteEn}, ${caducadoEn},
            ${vigenteHasta ? 'TEMPORAL' : 'PERMANENTE'}::tipo_vigencia, ${vigenteHasta},
            ${principalId}, ${cantidadReportes})
    RETURNING id`) as [{ id: number }];
  creados.push(id);
  return id;
}

async function crearReporteConFoto(
  incidenteId: number,
  categoriaId: number,
  usuarioId: number,
  desestimado = false,
) {
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO reporte (incidente_id, usuario_id, categoria_id, severidad_declarada, ubicacion, origen,
                         estado_verificacion)
    VALUES (${incidenteId}, ${usuarioId}, ${categoriaId}, 'LEVE',
            ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography, 'APP_MOVIL',
            ${desestimado ? 'DESESTIMADO' : 'VERIFICADO'}::estado_verificacion)
    RETURNING id`) as [{ id: number }];
  return prisma.fotografia.create({ data: { reporteId: id, rutaArchivo: `${randomUUID()}.jpg` } });
}

const listar = (consulta: Record<string, string>) => request(app).get('/api/incidentes').query(consulta);
const ids = (res: request.Response) => res.body.incidentes.map((i: { id: number }) => i.id).sort();

// Los incidentes de prueba se borran al final: la base de tests se reutiliza entre corridas.
afterAll(async () => {
  await prisma.incidente.updateMany({ where: { id: { in: creados } }, data: { incidentePrincipalId: null } });
  await prisma.reporte.deleteMany({ where: { incidenteId: { in: creados } } });
  await prisma.incidente.deleteMany({ where: { id: { in: creados } } });
});

describe('GET /api/incidentes', () => {
  it('es pública y devuelve cada punto con su forma', async () => {
    const zona = zonaNueva();
    const categoria = await crearCategoria();
    const punto = zona.punto();
    const id = await crearIncidente({ categoriaId: categoria.id, punto, cantidadReportes: 3 });

    const res = await listar({ bbox: zona.bbox });

    expect(res.status).toBe(200);
    expect(res.body.incidentes).toEqual([
      {
        id,
        lat: expect.closeTo(punto.lat, 9),
        lon: expect.closeTo(punto.lon, 9),
        categoriaId: categoria.id,
        estado: 'VERIFICADO',
        enRevision: false,
        primerReporteEn: '2026-10-01T12:00:00.000Z',
        cantidadReportes: 3,
      },
    ]);
  });

  it('un incidente REGISTRADO aparece con enRevision: true', async () => {
    const zona = zonaNueva();
    const categoria = await crearCategoria();
    await crearIncidente({ categoriaId: categoria.id, punto: zona.punto(), estado: 'REGISTRADO' });

    const res = await listar({ bbox: zona.bbox });

    expect(res.body.incidentes[0]).toMatchObject({ estado: 'REGISTRADO', enRevision: true });
  });

  it('no muestra desestimados, caducados, vencidos ni unidos a otro', async () => {
    const zona = zonaNueva();
    const { id: categoriaId } = await crearCategoria();
    const visible = await crearIncidente({ categoriaId, punto: zona.punto() });
    await crearIncidente({ categoriaId, punto: zona.punto(0.01), estado: 'DESESTIMADO' });
    await crearIncidente({ categoriaId, punto: zona.punto(0.02), caducadoEn: new Date() });
    await crearIncidente({ categoriaId, punto: zona.punto(0.03), vigenteHasta: new Date(Date.now() - 1000) });
    await crearIncidente({ categoriaId, punto: zona.punto(0.04), principalId: visible });
    const vigente = await crearIncidente({
      categoriaId,
      punto: zona.punto(0.05),
      vigenteHasta: new Date(Date.now() + 86_400_000),
    });

    const res = await listar({ bbox: zona.bbox });

    expect(ids(res)).toEqual([visible, vigente].sort());
  });

  describe('cada filtro funciona solo', () => {
    it('bbox', async () => {
      const zona = zonaNueva();
      const { id: categoriaId } = await crearCategoria();
      const adentro = await crearIncidente({ categoriaId, punto: zona.punto(0.4, 0.4) });
      await crearIncidente({ categoriaId, punto: zona.punto(0.6, 0) });

      const res = await listar({ bbox: zona.bbox });

      expect(ids(res)).toEqual([adentro]);
    });

    it('categoriaId', async () => {
      const zona = zonaNueva();
      const una = await crearCategoria();
      const otra = await crearCategoria();
      const buscado = await crearIncidente({ categoriaId: una.id, punto: zona.punto() });
      await crearIncidente({ categoriaId: otra.id, punto: zona.punto(0.1) });

      const res = await listar({ categoriaId: String(una.id) });

      expect(ids(res)).toEqual([buscado]);
    });

    it('estado', async () => {
      const zona = zonaNueva();
      const { id: categoriaId } = await crearCategoria();
      const resuelto = await crearIncidente({ categoriaId, punto: zona.punto(), estado: 'RESUELTO' });
      const derivado = await crearIncidente({ categoriaId, punto: zona.punto(0.1), estado: 'DERIVADO' });

      const res = await listar({ estado: 'RESUELTO' });

      expect(res.body.incidentes.every((i: { estado: string }) => i.estado === 'RESUELTO')).toBe(true);
      expect(ids(res)).toContain(resuelto);
      expect(ids(res)).not.toContain(derivado);
    });

    it('desde y hasta, con el día completo en hora de Argentina', async () => {
      const zona = zonaNueva();
      const { id: categoriaId } = await crearCategoria();
      const antes = await crearIncidente({
        categoriaId,
        punto: zona.punto(),
        primerReporteEn: new Date('2026-09-30T23:59:00-03:00'),
      });
      const primeraHora = await crearIncidente({
        categoriaId,
        punto: zona.punto(0.1),
        primerReporteEn: new Date('2026-10-01T00:00:00-03:00'),
      });
      const ultimaHora = await crearIncidente({
        categoriaId,
        punto: zona.punto(0.2),
        primerReporteEn: new Date('2026-10-02T23:59:00-03:00'),
      });
      const despues = await crearIncidente({
        categoriaId,
        punto: zona.punto(0.3),
        primerReporteEn: new Date('2026-10-03T00:00:00-03:00'),
      });

      const soloDesde = ids(await listar({ desde: '2026-10-01' }));
      const soloHasta = ids(await listar({ hasta: '2026-10-02' }));

      expect(soloDesde).toEqual(expect.arrayContaining([primeraHora, ultimaHora, despues]));
      expect(soloDesde).not.toContain(antes);
      expect(soloHasta).toEqual(expect.arrayContaining([antes, primeraHora, ultimaHora]));
      expect(soloHasta).not.toContain(despues);
    });
  });

  it('todos los filtros combinados', async () => {
    const zona = zonaNueva();
    const una = await crearCategoria();
    const otra = await crearCategoria();
    const fecha = new Date('2026-10-05T10:00:00-03:00');
    const buscado = await crearIncidente({
      categoriaId: una.id,
      punto: zona.punto(),
      estado: 'EN_EJECUCION',
      primerReporteEn: fecha,
    });
    // Cada uno falla en un solo filtro.
    await crearIncidente({
      categoriaId: otra.id,
      punto: zona.punto(0.1),
      estado: 'EN_EJECUCION',
      primerReporteEn: fecha,
    });
    await crearIncidente({
      categoriaId: una.id,
      punto: zona.punto(0.1),
      estado: 'DERIVADO',
      primerReporteEn: fecha,
    });
    await crearIncidente({
      categoriaId: una.id,
      punto: zona.punto(0.1),
      estado: 'EN_EJECUCION',
      primerReporteEn: new Date('2026-09-01T10:00:00-03:00'),
    });
    await crearIncidente({
      categoriaId: una.id,
      punto: zona.punto(2),
      estado: 'EN_EJECUCION',
      primerReporteEn: fecha,
    });

    const res = await listar({
      bbox: zona.bbox,
      categoriaId: String(una.id),
      estado: 'EN_EJECUCION',
      desde: '2026-10-04',
      hasta: '2026-10-05',
    });

    expect(ids(res)).toEqual([buscado]);
  });

  describe('filtros inválidos → 400 con detalle', () => {
    it.each([
      [{ bbox: '1,2,3' }, 'bbox'],
      [{ bbox: '10,0,5,1' }, 'bbox'],
      [{ bbox: 'a,b,c,d' }, 'bbox'],
      [{ estado: 'DESESTIMADO' }, 'estado'],
      [{ categoriaId: 'pozo' }, 'categoriaId'],
      [{ desde: 'ayer' }, 'desde'],
      [{ desde: '2026-10-05', hasta: '2026-10-01' }, 'hasta'],
    ])('%o', async (consulta, campo) => {
      const res = await listar(consulta);

      expect(res.status).toBe(400);
      expect(res.body.error.detalles.map((d: { campo: string }) => d.campo)).toContain(campo);
    });
  });

  it('responde en menos de 1 s con 1000 incidentes', async () => {
    const zona = zonaNueva();
    const { id: categoriaId } = await crearCategoria();
    const { lon, lat } = zona.punto();
    const nuevos = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO incidente (categoria_id, estado, ubicacion, primer_reporte_en, cantidad_reportes)
      SELECT ${categoriaId}, 'VERIFICADO',
             ST_SetSRID(ST_MakePoint(${lon} + random() * 0.4 - 0.2, ${lat} + random() * 0.4 - 0.2), 4326)::geography,
             now() - (n || ' minutes')::interval, 1
      FROM generate_series(1, 1000) AS n
      RETURNING id`;
    creados.push(...nuevos.map((n) => n.id));

    const inicio = performance.now();
    const res = await listar({ bbox: zona.bbox });
    const duracion = performance.now() - inicio;

    expect(res.body.incidentes).toHaveLength(1000);
    expect(duracion).toBeLessThan(1000);
  });
});

describe('GET /api/incidentes/:id', () => {
  it('devuelve la ficha con categoría, vecinos y fotos, sin las de reportes desestimados', async () => {
    const zona = zonaNueva();
    const categoria = await crearCategoria();
    const id = await crearIncidente({ categoriaId: categoria.id, punto: zona.punto(), cantidadReportes: 3 });
    const ana = await crearUsuario();
    const bruno = await crearUsuario();
    const foto1 = await crearReporteConFoto(id, categoria.id, ana.id);
    const foto2 = await crearReporteConFoto(id, categoria.id, ana.id);
    const foto3 = await crearReporteConFoto(id, categoria.id, bruno.id);
    await crearReporteConFoto(id, categoria.id, (await crearUsuario()).id, true);

    const res = await request(app).get(`/api/incidentes/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      lat: expect.any(Number),
      lon: expect.any(Number),
      categoria: { id: categoria.id, nombre: categoria.nombre },
      estado: 'VERIFICADO',
      enRevision: false,
      primerReporteEn: '2026-10-01T12:00:00.000Z',
      cantidadReportes: 3,
      cantidadVecinos: 2,
      direccion: null,
      fotos: [foto1, foto2, foto3].map((f) => ({ id: f.id, url: `/api/fotos/${f.id}` })),
    });
  });

  it('si se pide un incidente unido, responde con el principal y suma sus fotos', async () => {
    const zona = zonaNueva();
    const categoria = await crearCategoria();
    const principal = await crearIncidente({ categoriaId: categoria.id, punto: zona.punto() });
    const unido = await crearIncidente({
      categoriaId: categoria.id,
      punto: zona.punto(0.001),
      principalId: principal,
    });
    const vecino = await crearUsuario();
    const otroVecino = await crearUsuario();
    await crearReporteConFoto(principal, categoria.id, vecino.id);
    const fotoDelUnido = await crearReporteConFoto(unido, categoria.id, otroVecino.id);

    const res = await request(app).get(`/api/incidentes/${unido}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(principal);
    expect(res.body.cantidadVecinos).toBe(2);
    expect(res.body.fotos.map((f: { id: number }) => f.id)).toContain(fotoDelUnido.id);
  });

  it('un incidente desestimado, caducado o inexistente responde 404', async () => {
    const zona = zonaNueva();
    const { id: categoriaId } = await crearCategoria();
    const desestimado = await crearIncidente({ categoriaId, punto: zona.punto(), estado: 'DESESTIMADO' });
    const caducado = await crearIncidente({ categoriaId, punto: zona.punto(), caducadoEn: new Date() });

    for (const id of [desestimado, caducado, 999_999_999]) {
      const res = await request(app).get(`/api/incidentes/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('INCIDENTE_NO_ENCONTRADO');
    }
  });

  it('un reporte nuevo aparece en el mapa', async () => {
    const zona = zonaNueva();
    const { id: categoriaId } = await crearCategoria();
    const id = await crearIncidente({ categoriaId, punto: zona.punto(), estado: 'REGISTRADO' });

    const lista = await listar({ bbox: zona.bbox });
    const ficha = await request(app).get(`/api/incidentes/${id}`);

    expect(ids(lista)).toEqual([id]);
    expect(ficha.body.enRevision).toBe(true);
  });
});
