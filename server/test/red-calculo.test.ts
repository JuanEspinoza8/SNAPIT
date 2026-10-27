import { describe, expect, it } from 'vitest';
import type { ElementoOsm } from '../src/modulos/red/overpass.js';
import {
  armarRed,
  consultaRed,
  leerAncho,
  leerPendiente,
  type TramoRed,
} from '../src/modulos/red/redPeatonal.js';

// Nodos en una grilla de unos 100 m: el número es columna y fila (23 = columna 2, fila 3).
const nodo = (id: number, tags?: Record<string, string>): ElementoOsm => ({
  type: 'node',
  id,
  lat: -38.95 + (id % 10) * 0.0009,
  lon: -68.06 + Math.floor(id / 10) * 0.00115,
  ...(tags && { tags }),
});
const via = (id: number, nodes: number[], tags: Record<string, string> = { highway: 'residential' }) =>
  ({ type: 'way', id, nodes, tags }) satisfies ElementoOsm;
const nodos = (...ids: number[]) => ids.map((id) => nodo(id));
const extremos = (tramos: TramoRed[]) => tramos.map((t) => [t.nodoOrigen, t.nodoDestino]);

describe('armar la red: dónde se cortan los caminos', () => {
  it('dos calles que se cruzan quedan en cuatro tramos que se tocan en la esquina', () => {
    const red = armarRed([...nodos(12, 22, 32, 21, 23), via(1, [12, 22, 32]), via(2, [21, 22, 23])]);

    expect(extremos(red.tramos)).toEqual([
      [12, 22],
      [22, 32],
      [21, 22],
      [22, 23],
    ]);
    expect(red.nodos.map((n) => n.osmId)).toEqual([12, 21, 22, 23, 32]);
  });

  it('una calle que termina contra otra (una T) corta solo a la que sigue de largo', () => {
    const red = armarRed([...nodos(11, 21, 31, 22), via(1, [11, 21, 31]), via(2, [21, 22])]);

    expect(extremos(red.tramos)).toEqual([
      [11, 21],
      [21, 31],
      [21, 22],
    ]);
  });

  it('un nodo que no comparte con nadie queda dentro de la traza, no es esquina', () => {
    const red = armarRed([...nodos(11, 21, 31), via(1, [11, 21, 31])]);

    expect(extremos(red.tramos)).toEqual([[11, 31]]);
    expect(red.tramos[0]!.puntos).toHaveLength(3);
    expect(red.nodos.map((n) => n.osmId)).toEqual([11, 31]);
  });

  it('un camino cerrado se parte en dos en el nodo del medio: ningún tramo vuelve a su nodo de partida', () => {
    const red = armarRed([
      ...nodos(11, 21, 22, 12),
      via(1, [11, 21, 22, 12, 11], { highway: 'pedestrian', area: 'yes' }),
    ]);

    expect(red.tramos.map((t) => t.puntos.length)).toEqual([3, 3]);
    expect(extremos(red.tramos)).toEqual([
      [11, 22],
      [22, 11],
    ]);
    expect(red.nodos.map((n) => n.osmId)).toEqual([11, 22]);
  });

  it('un camino que pasa dos veces por el mismo nodo se corta ahí, sin dejar lazos', () => {
    const red = armarRed([...nodos(11, 21, 22, 31), via(1, [31, 21, 11, 22, 21])]);

    expect(red.tramos.every((t) => t.nodoOrigen !== t.nodoDestino)).toBe(true);
    // 31 → 21 hasta la primera pasada; la vuelta 21 → 11 → 22 → 21 es un lazo y se parte en 22.
    expect(extremos(red.tramos)).toEqual([
      [31, 21],
      [21, 22],
      [22, 21],
    ]);
  });

  it('ignora un nodo repetido seguido', () => {
    const red = armarRed([...nodos(11, 21), via(1, [11, 11, 21])]);

    expect(red.tramos).toHaveLength(1);
    expect(red.tramos[0]!.puntos).toHaveLength(2);
  });

  it('la misma respuesta en otro orden da la misma red', () => {
    const elementos = [...nodos(12, 22, 32, 21, 23), via(1, [12, 22, 32]), via(2, [21, 22, 23])];

    expect(armarRed([...elementos].reverse())).toEqual(armarRed(elementos));
  });
});

describe('armar la red: qué caminos entran', () => {
  it.each([
    ['una autopista', { highway: 'motorway' }, 'no es un camino para peatones'],
    ['un camino con foot=no', { highway: 'footway', foot: 'no' }, 'prohibido para peatones (foot=no)'],
    ['una calle privada', { highway: 'residential', access: 'private' }, 'acceso privado'],
    ['una calle cerrada', { highway: 'service', access: 'no' }, 'acceso privado'],
    ['una ciclovía', { highway: 'cycleway' }, 'ciclovía sin paso de peatones'],
    [
      'un estacionamiento',
      { highway: 'service', service: 'parking_aisle' },
      'estacionamiento o entrada de garage',
    ],
    [
      'una entrada de garage',
      { highway: 'service', service: 'driveway' },
      'estacionamiento o entrada de garage',
    ],
    [
      'una calle con las veredas aparte',
      { highway: 'residential', sidewalk: 'separate' },
      'las veredas están mapeadas aparte (sidewalk=separate)',
    ],
    [
      'una calle con las dos veredas aparte',
      { highway: 'tertiary', 'sidewalk:both': 'separate' },
      'las veredas están mapeadas aparte (sidewalk=separate)',
    ],
  ])('descarta %s y dice por qué', (_caso, tags, motivo) => {
    const red = armarRed([...nodos(11, 21), via(7, [11, 21], tags)]);

    expect(red.tramos).toEqual([]);
    expect(red.nodos).toEqual([]);
    expect(red.descartados).toEqual([{ elemento: 'way/7', motivo }]);
  });

  it.each([
    ['una calle privada con paso de peatones', { highway: 'residential', access: 'private', foot: 'yes' }],
    ['una ciclovía compartida con peatones', { highway: 'cycleway', foot: 'designated' }],
    ['un pasaje', { highway: 'service', service: 'alley' }],
    ['una calle con una sola vereda aparte', { highway: 'residential', 'sidewalk:left': 'separate' }],
  ])('deja entrar %s', (_caso, tags) => {
    expect(armarRed([...nodos(11, 21), via(7, [11, 21], tags)]).tramos).toHaveLength(1);
  });

  it('descarta un camino con un solo nodo o con un nodo que la respuesta no trae', () => {
    const red = armarRed([...nodos(11, 21), via(1, [11]), via(2, [11, 21, 31])]);

    expect(red.tramos).toEqual([]);
    expect(red.descartados).toEqual([
      { elemento: 'way/1', motivo: 'tiene menos de dos nodos' },
      { elemento: 'way/2', motivo: 'la respuesta no trae el nodo 31' },
    ]);
  });
});

describe('armar la red: de etiquetas de OSM a columnas', () => {
  const tramoCon = (tags: Record<string, string>, etiquetasNodo?: Record<string, string>) =>
    armarRed([nodo(11, etiquetasNodo), nodo(21), via(1, [11, 21], tags)]).tramos[0]!;

  it.each([
    [{ highway: 'steps' }, 'ESCALERA'],
    [{ highway: 'footway', footway: 'crossing' }, 'CRUCE'],
    [{ highway: 'path', path: 'crossing' }, 'CRUCE'],
    [{ highway: 'path' }, 'SENDA'],
    [{ highway: 'track' }, 'SENDA'],
    [{ highway: 'footway' }, 'VEREDA'],
    [{ highway: 'footway', footway: 'sidewalk' }, 'VEREDA'],
    [{ highway: 'pedestrian' }, 'VEREDA'],
    [{ highway: 'residential' }, 'VEREDA'],
    [{ highway: 'residential', cycleway: 'crossing' }, 'VEREDA'],
  ])('%o es %s', (tags, tipo) => {
    expect(tramoCon(tags).tipo).toBe(tipo);
  });

  it('tiene rampa si el cordón rebajado está en el camino o en alguno de sus nodos', () => {
    expect(tramoCon({ highway: 'footway', kerb: 'lowered' }).tieneRampa).toBe(true);
    expect(tramoCon({ highway: 'footway' }, { barrier: 'kerb', kerb: 'flush' }).tieneRampa).toBe(true);
    expect(tramoCon({ highway: 'footway' }, { barrier: 'kerb', kerb: 'raised' }).tieneRampa).toBe(false);
    expect(tramoCon({ highway: 'footway' }).tieneRampa).toBe(false);
  });

  it('en un camino peatonal toma ancho y superficie; en una calle no, porque son los de la calzada', () => {
    const tags = { width: '2', surface: 'paving_stones', incline: '6%' };

    expect(tramoCon({ highway: 'footway', ...tags })).toMatchObject({
      anchoEstimado: 2,
      superficie: 'paving_stones',
      pendientePorcentaje: 6,
    });
    expect(tramoCon({ highway: 'residential', ...tags })).toMatchObject({
      anchoEstimado: null,
      superficie: null,
      pendientePorcentaje: 6,
    });
  });

  it('marca el semáforo sonoro y el piso podotáctil de cada nodo', () => {
    const red = armarRed([
      nodo(11, { highway: 'traffic_signals', 'traffic_signals:sound': 'yes', tactile_paving: 'yes' }),
      nodo(21, { highway: 'traffic_signals', 'traffic_signals:sound': 'no', tactile_paving: 'no' }),
      via(1, [11, 21]),
    ]);

    expect(red.nodos).toMatchObject([
      { osmId: 11, tieneSemaforoSonoro: true, tienePisoPodotactil: true },
      { osmId: 21, tieneSemaforoSonoro: false, tienePisoPodotactil: false },
    ]);
  });

  it.each([
    ['8%', 8],
    ['-5 %', -5],
    ['+2.5%', 2.5],
    ['3,25%', 3.25],
    ['10', 10],
    ['45°', 100],
    ['up', null],
    ['down', null],
    ['5-10%', null],
    ['90°', null],
    ['1500%', null],
    [undefined, null],
  ])('pendiente "%s" → %s', (valor, esperado) => {
    expect(leerPendiente(valor)).toBe(esperado);
  });

  it.each([
    ['1.5', 1.5],
    ['1,5 m', 1.5],
    ['150 cm', 1.5],
    ['2.346', 2.35],
    ['0', null],
    ["3'", null],
    ['ancho', null],
    ['120', null],
    [undefined, null],
  ])('ancho "%s" → %s', (valor, esperado) => {
    expect(leerAncho(valor)).toBe(esperado);
  });
});

describe('consulta a Overpass', () => {
  it('pide los caminos de cada zona con su polígono en "lat lon" y suma sus nodos', () => {
    const consulta = consultaRed([
      [
        [-68.06, -38.95],
        [-68.05, -38.95],
        [-68.05, -38.94],
        [-68.06, -38.95],
      ],
      [
        [-68.1, -38.9],
        [-68.09, -38.9],
        [-68.09, -38.89],
        [-68.1, -38.9],
      ],
    ]);

    expect(consulta).toContain('(poly:"-38.95 -68.06 -38.95 -68.05 -38.94 -68.05 -38.95 -68.06")');
    expect(consulta).toContain('(poly:"-38.9 -68.1 -38.9 -68.09 -38.89 -68.09 -38.9 -68.1")');
    expect(consulta).toMatch(/way\["highway"~"\^\(footway\|.*\|service\)\$"\]/);
    expect(consulta).toContain('(._;>;);\nout body;');
  });
});
