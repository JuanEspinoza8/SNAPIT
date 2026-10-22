import { randomUUID } from 'node:crypto';
import type { Area, Categoria, Severidad, TipoPuntoInteres } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { recalcularPrioridad } from '../src/modulos/prioridad/servicio.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { jpegConExif, jpegSinExif } from './imagenes.js';

// La dirección no se consulta: no hace falta para la prioridad.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

// osm_id propios de este archivo, distintos de los de importar-puntos.test.ts.
const OSM_BASE = 910_000_000_000_000;
let siguienteOsm = OSM_BASE + Math.floor(Math.random() * 1_000_000_000);

const vecinos: number[] = [];
afterAll(async () => {
  await borrarReportesDe(vecinos);
  await prisma.puntoInteres.deleteMany({
    where: { osmId: { gte: BigInt(OSM_BASE), lt: BigInt(OSM_BASE + 1_000_000_000) } },
  });
});

// Unos 80 m al norte (un grado de latitud son unos 111 km).
const OCHENTA_METROS = 0.00072;

let area: Area;
let categoria: Categoria;
// Cada test en su propio lugar, lejos de los puntos de importar-puntos.test.ts (cerca de −68,06).
let lat: number;
const lon = -68.45;

beforeEach(async () => {
  const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
  area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id, pesoSeveridadBase: '1.50' },
  });
  lat = -38.9 - Math.random() * 0.2;
});

async function crearVecino() {
  const vecino = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(vecino.id);
  return vecino;
}

/** Un reporte en el lugar del test. Con una foto de galería sin EXIF queda pendiente de revisión. */
async function reportar(
  opciones: { severidad?: Severidad; pendiente?: boolean; desplazamiento?: number } = {},
) {
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(await crearVecino())}`)
    .field('categoriaId', String(categoria.id))
    .field('severidadDeclarada', opciones.severidad ?? 'MODERADA')
    .field('lat', String(lat + (opciones.desplazamiento ?? 0)))
    .field('lon', String(lon))
    .field('origen', 'APP_MOVIL')
    .attach('foto', opciones.pendiente ? jpegSinExif() : jpegConExif(), 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number };
}

function crearPunto(tipo: TipoPuntoInteres, nombre: string, desplazamiento: number) {
  return prisma.$executeRaw`
    INSERT INTO punto_interes (tipo, nombre, ubicacion, osm_id)
    VALUES (${tipo}::tipo_punto_interes, ${nombre},
            ST_SetSRID(ST_MakePoint(${lon}, ${lat + desplazamiento}), 4326)::geography, ${BigInt(siguienteOsm++)})`;
}

const recalcular = (incidenteId: number) => prisma.$transaction((tx) => recalcularPrioridad(tx, incidenteId));

async function prioridad(incidenteId: number) {
  const incidente = await prisma.incidente.findUniqueOrThrow({
    where: { id: incidenteId },
    select: { puntajePrioridad: true },
  });
  const factores = await prisma.factorPrioridad.findMany({
    where: { incidenteId },
    orderBy: { id: 'asc' },
    select: { factor: true, valor: true, detalle: true },
  });
  return {
    puntaje: Number(incidente.puntajePrioridad),
    factores: factores.map((f) => ({ ...f, valor: Number(f.valor) })),
  };
}

describe('prioridad del incidente', () => {
  it('al crear el incidente guarda el puntaje y los cuatro factores con su explicación', async () => {
    const { incidenteId } = await reportar({ severidad: 'GRAVE' });

    expect(await prioridad(incidenteId)).toEqual({
      puntaje: 66.25,
      factores: [
        {
          factor: 'SEVERIDAD',
          valor: 60,
          detalle: `Gravedad grave en ${categoria.nombre}, una categoría que pesa ×1,5: +60`,
        },
        { factor: 'EVIDENCIAS', valor: 6.25, detalle: 'Lo reportaron 1 vez: +6,3' },
        { factor: 'ANTIGUEDAD', valor: 0, detalle: 'Lleva menos de un día sin resolverse: +0' },
        {
          factor: 'CONTEXTO_URBANO',
          valor: 0,
          detalle: 'Sin escuelas, centros de salud, paradas ni edificios públicos a menos de 150 m: +0',
        },
      ],
    });
  });

  it('un reporte que se suma reemplaza el desglose: siguen siendo cuatro filas, con más evidencias', async () => {
    const primero = await reportar();
    const segundo = await reportar();

    expect(segundo.incidenteId).toBe(primero.incidenteId);
    const { puntaje, factores } = await prioridad(primero.incidenteId);
    expect(factores).toHaveLength(4);
    // 25 × ln 3 / ln 16
    expect(factores[1]).toEqual({
      factor: 'EVIDENCIAS',
      valor: 9.91,
      detalle: 'Lo reportaron 2 veces: +9,9',
    });
    expect(puntaje).toBe(49.91);
  });

  it('con una parada y una escuela cerca suma la escuela, con su nombre y su distancia', async () => {
    await crearPunto('PARADA_TRANSPORTE', 'N-2935', 0.0002);
    await crearPunto('ESCUELA', 'Escuela N° 123', OCHENTA_METROS);

    const { incidenteId } = await reportar();

    const { puntaje, factores } = await prioridad(incidenteId);
    expect(factores[3]).toEqual({
      factor: 'CONTEXTO_URBANO',
      valor: 15,
      detalle: 'A 80 m de Escuela N° 123 (escuela): +15',
    });
    expect(puntaje).toBe(61.25);
  });

  it('cuenta una vez a cada vecino que confirmó el incidente o uno que se le unió', async () => {
    const principal = await reportar();
    // A un kilómetro: abre otro incidente, que se une a mano.
    const duplicado = await reportar({ desplazamiento: 0.01 });
    await prisma.incidente.update({
      where: { id: duplicado.incidenteId },
      data: { incidentePrincipalId: principal.incidenteId },
    });
    const [ana, bruno] = [await crearVecino(), await crearVecino()];
    await prisma.confirmacionIncidente.createMany({
      data: [
        { incidenteId: principal.incidenteId, usuarioId: ana.id },
        { incidenteId: duplicado.incidenteId, usuarioId: ana.id },
        { incidenteId: duplicado.incidenteId, usuarioId: bruno.id },
      ],
    });

    await recalcular(principal.incidenteId);

    // n = 1 reporte + 2 vecinos: 25 × ln 4 / ln 16
    expect((await prioridad(principal.incidenteId)).factores[1]).toEqual({
      factor: 'EVIDENCIAS',
      valor: 12.5,
      detalle: 'Lo reportaron 1 vez y lo confirmaron 2 vecinos: +12,5',
    });
  });

  it('conserva el ajuste manual de un operador al recalcular', async () => {
    const { incidenteId } = await reportar();
    const operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });
    await prisma.incidente.update({
      where: { id: incidenteId },
      data: { prioridadManual: '80', motivoPrioridadManual: 'obra programada', ajustadaPorId: operador.id },
    });

    await recalcular(incidenteId);

    const { puntaje, factores } = await prioridad(incidenteId);
    expect(puntaje).toBe(46.25);
    expect(factores).toHaveLength(5);
    expect(factores[4]).toEqual({
      factor: 'AJUSTE_MANUAL',
      valor: 33.75,
      detalle: `Ajuste manual de ${operador.nombre} (obra programada): +33,8`,
    });
  });

  it('un incidente desestimado no se recalcula: su desglose queda como estaba al cerrarse', async () => {
    const reporte = await reportar({ pendiente: true });
    const antes = await prioridad(reporte.incidenteId);
    const operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });

    const res = await request(app)
      .post(`/api/reportes/${reporte.id}/revision`)
      .set('Authorization', `Bearer ${crearTokenAcceso(operador)}`)
      .send({ decision: 'DESESTIMADO' });

    expect(res.status).toBe(200);
    expect(res.body.incidente).toMatchObject({ estado: 'DESESTIMADO' });
    expect(await prioridad(reporte.incidenteId)).toEqual(antes);
  });
});
