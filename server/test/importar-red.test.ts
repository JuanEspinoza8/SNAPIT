import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/compartido/prisma.js';
import { crearClienteOverpass, type ElementoOsm } from '../src/modulos/red/overpass.js';
import { importarRed } from '../src/modulos/red/servicio.js';
import { crearOrganismoDePrueba } from './apoyo.js';

// Este archivo reemplaza toda la red de la base de pruebas: corre solo, después de los demás (vitest.config.ts).

/*
 * test/osm/recorte-red.json: una grilla armada a mano con el formato de Overpass, lejos de Neuquén para no
 * caer en la zona piloto real. Cada número es columna y fila; las cuadras miden unos 100 m.
 *
 *                           s1
 *   02 ─────── 12 ─────── 22  ┊      32
 *   │          │ lazo     │   ┊      │
 *   01 ──m──── 11 ─────── 21 ─┊──── 31 ──── 41
 *   │        ╱ │  f1──f2  │   ┊      │
 *   00 ───╱─── 10 ─────── 20 ─┊ p1   30
 *              c1             ┊ borde de la zona
 *
 * - 00 ─ 11: camino peatonal en diagonal (ancho 2, hormigón).
 * - 00 ─ 01 ─ 02: Avenida A, con pendiente 5 % y el ancho y la superficie de la calzada.
 * - 10 ─ c1: cruce peatonal; c1 tiene cordón rebajado. En 11 hay semáforo sonoro y piso podotáctil.
 * - 22 ─ s1: escalera. 12 ─ lazo ─ 12: sendero cerrado. f1 ─ f2: vereda suelta, sin conexión.
 * - 20 ─ p1: calle privada (se descarta). La columna 3 y el tramo 31 ─ 41 quedan fuera de la zona.
 */
const RECORTE = fileURLToPath(new URL('./osm/recorte-red.json', import.meta.url));
const BASE = 900_000_000_000_000;
const esquina = (columna: number, fila: number) => BASE + 100 + 10 * columna + fila;
const C1 = BASE + 204;
const Q2 = BASE + 206;
const F1 = BASE + 208;

const ZONA = 'Zona de prueba de importar-red';
const enGrilla = (columna: number, fila: number) =>
  `${(-68.5 + columna * 0.00115).toFixed(7)} ${(-38.7 + fila * 0.0009).toFixed(7)}`;
const POLIGONO = `POLYGON((${[
  [-0.2, -0.2],
  [2.2, -0.2],
  [2.2, 2.2],
  [-0.2, 2.2],
  [-0.2, -0.2],
]
  .map(([x, y]) => enGrilla(x!, y!))
  .join(', ')}))`;

const fetchSimulado = vi.fn<typeof fetch>();
const overpass = crearClienteOverpass({ url: 'http://127.0.0.1:9', userAgent: 'SnapIt/prueba' });
let archivo: string;

const importar = (sinConexion: boolean, desde = archivo) =>
  importarRed({ prisma, archivo: desde, sinConexion, overpass });

const vaciarRed = () => prisma.$executeRaw`TRUNCATE tramo_peatonal, nodo_peatonal RESTART IDENTITY CASCADE`;

function leerNodos() {
  return prisma.$queryRaw<
    { id: bigint; osmId: bigint; ubicacion: string; sonoro: boolean; podotactil: boolean }[]
  >`
    SELECT id, osm_id AS "osmId", ST_AsText(ubicacion) AS ubicacion,
           tiene_semaforo_sonoro AS sonoro, tiene_piso_podotactil AS podotactil
    FROM nodo_peatonal ORDER BY id`;
}

async function leerTramos() {
  const filas = await prisma.$queryRaw<
    {
      id: bigint;
      origen: bigint;
      destino: bigint;
      tipo: string;
      rampa: boolean;
      pendiente: number | null;
      ancho: number | null;
      superficie: string | null;
      longitud: number;
      costo: number;
      geometria: string;
    }[]
  >`
    SELECT t.id, o.osm_id AS origen, d.osm_id AS destino, t.tipo::text AS tipo, t.tiene_rampa AS rampa,
           t.pendiente_porcentaje::float8 AS pendiente, t.ancho_estimado::float8 AS ancho, t.superficie,
           t.longitud_metros::float8 AS longitud, t.costo_base::float8 AS costo, ST_AsText(t.geometria) AS geometria
    FROM tramo_peatonal t
    JOIN nodo_peatonal o ON o.id = t.nodo_origen_id
    JOIN nodo_peatonal d ON d.id = t.nodo_destino_id
    ORDER BY t.id`;
  return filas.map((fila) => ({ ...fila, origen: Number(fila.origen), destino: Number(fila.destino) }));
}

const tramoEntre = async (origen: number, destino: number) =>
  (await leerTramos()).filter((t) => t.origen === origen && t.destino === destino);

/** Una respuesta de Overpass con solo algunos elementos del recorte. */
async function recorteCon(filtro: (elemento: ElementoOsm) => boolean) {
  const recorte = JSON.parse(await readFile(RECORTE, 'utf8')) as { elements: ElementoOsm[] };
  return JSON.stringify({ ...recorte, elements: recorte.elements.filter(filtro) });
}

beforeAll(async () => {
  await prisma.$executeRaw`DELETE FROM zona_piloto WHERE nombre = ${ZONA}`;
  await prisma.$executeRaw`
    INSERT INTO zona_piloto (nombre, geometria) VALUES (${ZONA}, ST_GeomFromText(${POLIGONO}, 4326)::geography)`;
});

beforeEach(async () => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
  archivo = path.join(os.tmpdir(), `snapit-red-${randomUUID()}.json`);
  await vaciarRed();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(archivo, { force: true });
});

afterAll(async () => {
  await vaciarRed();
  await prisma.$executeRaw`DELETE FROM zona_piloto WHERE nombre = ${ZONA}`;
});

describe('importar la red peatonal', () => {
  it('genera los nodos y tramos esperados del recorte', async () => {
    const resumen = await importar(true, RECORTE);

    expect(resumen).toMatchObject({
      origen: 'archivo',
      fechaDatos: '2026-10-27T12:00:00Z',
      nodos: 15,
      tramos: 19,
      porTipo: { VEREDA: 15, CRUCE: 1, ESCALERA: 1, SENDA: 2 },
      conRampa: 1,
      conSemaforoSonoro: 1,
      conPisoPodotactil: 1,
      fueraDeZona: 3,
      vinculosBorrados: 0,
      descartados: [{ elemento: `way/${BASE + 10}`, motivo: 'acceso privado' }],
    });
    expect(resumen.zonas).toContain(ZONA);
    // La vereda suelta queda como un pedazo aparte: así se encuentra para corregirla en el relevamiento.
    expect(resumen.componentes).toEqual([
      { nodos: 13, nodoOsmId: esquina(0, 0) },
      { nodos: 2, nodoOsmId: F1 },
    ]);
  });

  it('guarda los atributos de cada tramo y la longitud real como costo', async () => {
    await importar(true, RECORTE);
    const tramos = await leerTramos();

    expect(await tramoEntre(esquina(0, 0), esquina(0, 1))).toMatchObject([
      { tipo: 'VEREDA', pendiente: 5, ancho: null, superficie: null, rampa: false },
    ]);
    expect(await tramoEntre(esquina(0, 0), esquina(1, 1))).toMatchObject([
      { tipo: 'VEREDA', ancho: 2, superficie: 'concrete' },
    ]);
    expect(await tramoEntre(esquina(1, 0), C1)).toMatchObject([{ tipo: 'CRUCE', rampa: true }]);
    expect(await tramoEntre(esquina(2, 2), BASE + 202)).toMatchObject([
      { tipo: 'ESCALERA', pendiente: null },
    ]);
    expect(await tramoEntre(esquina(1, 2), Q2)).toMatchObject([{ tipo: 'SENDA' }]);
    expect(await tramoEntre(Q2, esquina(1, 2))).toMatchObject([{ tipo: 'SENDA' }]);

    const [cuadra] = await tramoEntre(esquina(0, 0), esquina(1, 0));
    expect(cuadra!.longitud).toBeGreaterThan(95);
    expect(cuadra!.longitud).toBeLessThan(105);
    expect(tramos.every((t) => t.costo === t.longitud)).toBe(true);
  });

  it('un tramo que sale de la zona entra entero; los que quedan del todo afuera no se cargan', async () => {
    await importar(true, RECORTE);
    const osmIds = (await leerNodos()).map((n) => Number(n.osmId));

    expect(await tramoEntre(esquina(2, 1), esquina(3, 1))).toHaveLength(1);
    expect(osmIds).toContain(esquina(3, 1));
    expect(osmIds).not.toContain(esquina(4, 1));
    expect(osmIds).not.toContain(esquina(3, 0));
    expect(osmIds).not.toContain(esquina(3, 2));
  });

  it('correrlo dos veces deja la misma red, con los mismos id', async () => {
    await importar(true, RECORTE);
    const nodos = await leerNodos();
    const tramos = await leerTramos();

    await importar(true, RECORTE);

    expect(await leerNodos()).toEqual(nodos);
    expect(await leerTramos()).toEqual(tramos);
  });

  it('pgr_dijkstra entre dos esquinas de la zona devuelve un camino', async () => {
    await importar(true, RECORTE);

    const camino = await prisma.$queryRaw<{ osmId: bigint; acumulado: number }[]>`
      SELECT n.osm_id AS "osmId", d.agg_cost::float8 AS acumulado
      FROM pgr_dijkstra(
        'SELECT id, source, target, cost, reverse_cost FROM red_peatonal',
        (SELECT id FROM nodo_peatonal WHERE osm_id = ${String(esquina(0, 0))}::bigint),
        (SELECT id FROM nodo_peatonal WHERE osm_id = ${String(esquina(2, 2))}::bigint)
      ) d
      JOIN nodo_peatonal n ON n.id = d.node
      ORDER BY d.seq`;

    // Por la diagonal (unos 141 m) y dos cuadras más: más corto que las cuatro cuadras de la grilla.
    expect(camino.map((paso) => Number(paso.osmId)).slice(0, 2)).toEqual([esquina(0, 0), esquina(1, 1)]);
    expect(Number(camino.at(-1)!.osmId)).toBe(esquina(2, 2));
    expect(camino.at(-1)!.acumulado).toBeGreaterThan(330);
    expect(camino.at(-1)!.acumulado).toBeLessThan(350);
  });

  it('vacía los vínculos con incidentes y avisa cuántos eran', async () => {
    await importar(true, RECORTE);
    const { categoria } = await crearOrganismoDePrueba();
    const [incidente] = await prisma.$queryRaw<[{ id: number }]>`
      INSERT INTO incidente (categoria_id, ubicacion)
      VALUES (${categoria.id}, ST_SetSRID(ST_MakePoint(-68.49885, -38.6991), 4326)::geography)
      RETURNING id`;
    await prisma.$executeRaw`
      INSERT INTO incidente_tramo (incidente_id, tramo_peatonal_id) SELECT ${incidente.id}, id FROM tramo_peatonal LIMIT 2`;

    try {
      const resumen = await importar(true, RECORTE);

      expect(resumen.vinculosBorrados).toBe(2);
      expect(await prisma.incidenteTramo.count()).toBe(0);
    } finally {
      await prisma.incidente.delete({ where: { id: incidente.id } });
    }
  });

  it('si ningún tramo toca la zona, no carga nada y deja la red anterior', async () => {
    await importar(true, RECORTE);
    const columna3 = [esquina(3, 0), esquina(3, 1), esquina(3, 2), BASE + 7];
    await writeFile(archivo, await recorteCon((e) => columna3.includes(e.id)));

    await expect(importar(true)).rejects.toThrow('Ningún tramo de la respuesta toca una zona piloto activa');

    expect(await leerTramos()).toHaveLength(19);
  });

  it('sin conexión y sin respuesta guardada, dice cómo descargarla', async () => {
    await expect(importar(true)).rejects.toThrow('Corré el script con conexión para descargarla');
  });

  it('con conexión pide los caminos de la zona, guarda la respuesta tal cual llegó y la carga', async () => {
    const texto = await readFile(RECORTE, 'utf8');
    fetchSimulado.mockResolvedValueOnce(new Response(texto));

    const resumen = await importar(false);

    const consulta = new URLSearchParams(fetchSimulado.mock.calls[0]![1]!.body as URLSearchParams).get(
      'data',
    );
    expect(consulta).toContain(`(poly:"-38.70018 -68.50023 -38.70018 -68.49747`);
    expect(resumen.origen).toBe('overpass');
    expect(await readFile(archivo, 'utf8')).toBe(texto);
    expect(resumen.tramos).toBe(19);
  });

  it.each([
    ['Overpass falla', () => new Response('<html>Gateway Timeout</html>', { status: 504 }), 'respondió 504'],
    [
      'no trae ningún camino',
      () => new Response(JSON.stringify({ elements: [] })),
      'Overpass no devolvió ningún camino',
    ],
  ])('si %s, no pisa la respuesta guardada ni la red', async (_caso, responder, mensaje) => {
    await importar(true, RECORTE);
    await writeFile(archivo, 'respuesta anterior');
    fetchSimulado.mockResolvedValueOnce(responder());

    await expect(importar(false)).rejects.toThrow(mensaje);

    expect(await readFile(archivo, 'utf8')).toBe('respuesta anterior');
    expect(await leerTramos()).toHaveLength(19);
  });
});
