import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/compartido/prisma.js';
import { crearClienteOverpass, type ElementoOsm } from '../src/modulos/red/overpass.js';
import { importarPuntosInteres } from '../src/modulos/red/servicio.js';

// Números de OSM muy por encima de los reales, para no mezclarse con otros datos de la base de pruebas.
const BASE = 900_000_000_000_000;

const ELEMENTOS: ElementoOsm[] = [
  { type: 'node', id: BASE + 1, lat: -38.951, lon: -68.059, tags: { highway: 'bus_stop', name: 'N-2935' } },
  {
    type: 'way',
    id: BASE + 2,
    center: { lat: -38.952, lon: -68.06 },
    tags: { amenity: 'school', name: 'Escuela N° 123' },
  },
  { type: 'relation', id: BASE + 3, center: { lat: -38.953, lon: -68.061 }, tags: { amenity: 'hospital' } },
];

const respuesta = (elementos: ElementoOsm[]) =>
  JSON.stringify({ osm3s: { timestamp_osm_base: '2026-10-17T03:04:06Z' }, elements: elementos });

const cuenta = (escuelas: number[], salud: number[], paradas: number[]) => ({
  ESCUELA: { nuevos: escuelas[0], actualizados: escuelas[1] },
  CENTRO_SALUD: { nuevos: salud[0], actualizados: salud[1] },
  PARADA_TRANSPORTE: { nuevos: paradas[0], actualizados: paradas[1] },
  EDIFICIO_PUBLICO: { nuevos: 0, actualizados: 0 },
});

// Overpass simulado: si algún test se olvida de simularlo, falla contra un puerto local cerrado.
const fetchSimulado = vi.fn<typeof fetch>();
const overpass = crearClienteOverpass({ url: 'http://127.0.0.1:9', userAgent: 'SnapIt/prueba' });
let archivo: string;

const importar = (sinConexion: boolean) => importarPuntosInteres({ prisma, archivo, sinConexion, overpass });

const borrarPuntosDePrueba = () =>
  prisma.puntoInteres.deleteMany({ where: { osmId: { gte: BigInt(BASE) } } });

function leerPuntos() {
  return prisma.$queryRaw<{ osmId: bigint; tipo: string; nombre: string; lat: number; lon: number }[]>`
    SELECT osm_id AS "osmId", tipo::text AS tipo, nombre,
           ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lon
    FROM punto_interes WHERE osm_id >= ${BigInt(BASE)} ORDER BY osm_id`;
}

beforeEach(async () => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
  archivo = path.join(os.tmpdir(), `snapit-puntos-${randomUUID()}.json`);
  await borrarPuntosDePrueba();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(archivo, { force: true });
});

afterAll(borrarPuntosDePrueba);

describe('importar puntos de interés', () => {
  it('correrlo dos veces no duplica: la segunda vez todos ya estaban', async () => {
    await writeFile(archivo, respuesta(ELEMENTOS));

    const primera = await importar(true);
    const segunda = await importar(true);

    expect(await leerPuntos()).toHaveLength(3);
    expect(primera.porTipo).toEqual(cuenta([1, 0], [1, 0], [1, 0]));
    expect(segunda.porTipo).toEqual(cuenta([0, 1], [0, 1], [0, 1]));
  });

  it('guarda tipo, nombre y coordenadas, y los actualiza si cambiaron en OSM', async () => {
    await writeFile(archivo, respuesta(ELEMENTOS));
    await importar(true);

    expect(await leerPuntos()).toEqual([
      { osmId: BigInt(BASE + 1), tipo: 'PARADA_TRANSPORTE', nombre: 'N-2935', lat: -38.951, lon: -68.059 },
      { osmId: BigInt(BASE + 2), tipo: 'ESCUELA', nombre: 'Escuela N° 123', lat: -38.952, lon: -68.06 },
      {
        osmId: BigInt(BASE + 3),
        tipo: 'CENTRO_SALUD',
        nombre: 'Centro de salud',
        lat: -38.953,
        lon: -68.061,
      },
    ]);

    const [parada, ...resto] = ELEMENTOS;
    const movida = { ...parada!, lat: -38.96, tags: { highway: 'bus_stop', name: 'N-2936' } };
    await writeFile(archivo, respuesta([movida, ...resto]));
    await importar(true);

    const puntos = await leerPuntos();
    expect(puntos).toHaveLength(3);
    expect(puntos[0]).toEqual({
      osmId: BigInt(BASE + 1),
      tipo: 'PARADA_TRANSPORTE',
      nombre: 'N-2936',
      lat: -38.96,
      lon: -68.059,
    });
  });

  it('sin conexión carga la respuesta guardada y no usa la red', async () => {
    await writeFile(archivo, respuesta(ELEMENTOS));

    const resumen = await importar(true);

    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(resumen.origen).toBe('archivo');
    expect(resumen.fechaDatos).toBe('2026-10-17T03:04:06Z');
    expect(await leerPuntos()).toHaveLength(3);
  });

  it('sin conexión y sin respuesta guardada, dice cómo descargarla', async () => {
    await expect(importar(true)).rejects.toThrow('Corré el script con conexión para descargarla');
  });

  it('con conexión guarda la respuesta tal cual llegó y la carga', async () => {
    const texto = respuesta(ELEMENTOS);
    fetchSimulado.mockResolvedValueOnce(new Response(texto));

    const resumen = await importar(false);

    expect(resumen.origen).toBe('overpass');
    expect(await readFile(archivo, 'utf8')).toBe(texto);
    expect(await leerPuntos()).toHaveLength(3);
  });

  it.each([
    ['Overpass falla', () => new Response('<html>Gateway Timeout</html>', { status: 504 }), 'respondió 504'],
    ['no trae ningún punto', () => new Response(respuesta([])), 'no devolvió ningún punto'],
  ])('si %s, no pisa la respuesta guardada ni toca la base', async (_caso, responder, mensaje) => {
    await writeFile(archivo, 'respuesta anterior');
    fetchSimulado.mockResolvedValueOnce(responder());

    await expect(importar(false)).rejects.toThrow(mensaje);

    expect(await readFile(archivo, 'utf8')).toBe('respuesta anterior');
    expect(await leerPuntos()).toEqual([]);
  });

  it('un nodo y un área con el mismo número: carga uno y sigue con los demás', async () => {
    const repetido: ElementoOsm = { ...ELEMENTOS[1]!, id: BASE + 1 };
    await writeFile(archivo, respuesta([...ELEMENTOS, repetido]));

    const resumen = await importar(true);

    expect(await leerPuntos()).toHaveLength(3);
    expect(resumen.descartados).toEqual([
      { elemento: `way/${BASE + 1}`, motivo: `el osm_id ${BASE + 1} ya lo usa node/${BASE + 1}` },
    ]);
  });

  it('avisa cuántos puntos de la base no vinieron en la carga, sin borrarlos', async () => {
    await writeFile(archivo, respuesta(ELEMENTOS));
    const completa = await importar(true);
    await writeFile(archivo, respuesta(ELEMENTOS.slice(0, 2)));
    const sinUno = await importar(true);

    // La base de pruebas puede tener otros puntos: se mira la diferencia entre las dos cargas.
    expect(sinUno.ausentes - completa.ausentes).toBe(1);
    expect(await leerPuntos()).toHaveLength(3);
  });
});
