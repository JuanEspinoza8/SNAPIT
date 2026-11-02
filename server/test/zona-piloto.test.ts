import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { leerZonasPiloto } from '../src/modulos/red/zonaPiloto.js';
import { ARCHIVO_ZONAS_PILOTO } from '../src/semilla/datos.js';

const ACTIVA = 'Zona de prueba activa (zona-piloto)';
const INACTIVA = 'Zona de prueba inactiva (zona-piloto)';
const CUADRADO = [
  [-68.5, -38.7],
  [-68.49, -38.7],
  [-68.49, -38.69],
  [-68.5, -38.69],
  [-68.5, -38.7],
];
const WKT = `POLYGON((${CUADRADO.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;

const borrarZonasDePrueba = () =>
  prisma.$executeRaw`DELETE FROM zona_piloto WHERE nombre IN (${ACTIVA}, ${INACTIVA})`;

const coleccion = (geometry: unknown, nombre = 'Zona') =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { nombre }, geometry }],
  });

describe('GET /api/zona-piloto', () => {
  beforeAll(async () => {
    await borrarZonasDePrueba();
    await prisma.$executeRaw`
      INSERT INTO zona_piloto (nombre, geometria, activa) VALUES
        (${ACTIVA}, ST_GeomFromText(${WKT}, 4326)::geography, true),
        (${INACTIVA}, ST_GeomFromText(${WKT}, 4326)::geography, false)`;
  });

  afterAll(borrarZonasDePrueba);

  it('sin sesión devuelve las zonas activas como un FeatureCollection de GeoJSON', async () => {
    const res = await request(app).get('/api/zona-piloto');

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    const zona = res.body.features.find(
      (f: { properties: { nombre: string } }) => f.properties.nombre === ACTIVA,
    );
    expect(zona).toEqual({
      type: 'Feature',
      id: expect.any(Number),
      properties: { nombre: ACTIVA },
      geometry: { type: 'Polygon', coordinates: [CUADRADO] },
    });
  });

  it('no incluye las zonas desactivadas', async () => {
    const res = await request(app).get('/api/zona-piloto');

    const nombres = res.body.features.map((f: { properties: { nombre: string } }) => f.properties.nombre);
    expect(nombres).not.toContain(INACTIVA);
  });
});

describe('leer el archivo de zonas piloto', () => {
  it('el de db/datos tiene una zona con su polígono', async () => {
    const zonas = leerZonasPiloto(await readFile(ARCHIVO_ZONAS_PILOTO, 'utf8'));

    expect(zonas).toHaveLength(1);
    expect(zonas[0]!.nombre).toBe('Bouquet Roldán y La Sirena');
    expect(zonas[0]!.geometria.type).toBe('Polygon');
  });

  it('devuelve el nombre y la geometría de cada zona', () => {
    const geometria = { type: 'Polygon', coordinates: [CUADRADO] };

    expect(leerZonasPiloto(coleccion(geometria, '  Centro  '))).toEqual([{ nombre: 'Centro', geometria }]);
  });

  it.each([
    ['no es JSON', '{', 'no es JSON'],
    [
      'es un Feature suelto',
      JSON.stringify({ type: 'Feature', properties: { nombre: 'Zona' }, geometry: null }),
      'type',
    ],
    ['no tiene zonas', JSON.stringify({ type: 'FeatureCollection', features: [] }), 'no hay ninguna zona'],
    [
      'es un MultiPolygon',
      coleccion({ type: 'MultiPolygon', coordinates: [[CUADRADO]] }),
      'features.0.geometry.type',
    ],
    [
      'el anillo no se cierra',
      coleccion({ type: 'Polygon', coordinates: [CUADRADO.slice(0, 4).concat([[-68.5, -38.695]])] }),
      'terminar en el mismo punto',
    ],
    [
      'el anillo tiene tres puntos',
      coleccion({ type: 'Polygon', coordinates: [[CUADRADO[0], CUADRADO[1], CUADRADO[0]]] }),
      'al menos 4 puntos',
    ],
    [
      'la latitud está fuera de rango',
      coleccion({ type: 'Polygon', coordinates: [CUADRADO.map(([lon]) => [lon, -100])] }),
      'features.0.geometry.coordinates.0',
    ],
    [
      'el nombre no entra en la columna',
      coleccion({ type: 'Polygon', coordinates: [CUADRADO] }, 'x'.repeat(121)),
      'features.0.properties.nombre',
    ],
    [
      'dos zonas se llaman igual',
      JSON.stringify({
        type: 'FeatureCollection',
        features: [1, 2].map(() => ({
          type: 'Feature',
          properties: { nombre: 'Zona' },
          geometry: { type: 'Polygon', coordinates: [CUADRADO] },
        })),
      }),
      'hay dos zonas con el mismo nombre',
    ],
  ])('rechaza un archivo que %s', (_caso, texto, mensaje) => {
    expect(() => leerZonasPiloto(texto)).toThrow(mensaje);
  });
});
