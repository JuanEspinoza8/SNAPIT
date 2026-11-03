import { describe, expect, it } from 'vitest';
import type { ElementoOsm } from '../src/modulos/red/overpass.js';
import { armarRed } from '../src/modulos/red/redPeatonal.js';
import {
  aplicarRelevamiento,
  leerRelevamiento,
  rampaDeCuadra,
  superficieDeCuadra,
  type Relevamiento,
} from '../src/modulos/red/relevamiento.js';

/*
 * Grilla de cuadras de unos 100 m, como en red-calculo.test.ts: el número del nodo es columna y fila.
 *
 *   12 ── Calle Norte ── 22
 *   │                    │
 *   Avenida              Calle B (cordón rebajado en OSM)
 *   │                    │
 *   11 ── Calle Sur ──── 21 ── Calle Sur ── 31
 */
const lat = (id: number) => -38.95 + (id % 10) * 0.0009;
const lon = (id: number) => -68.06 + Math.floor(id / 10) * 0.00115;
const nodo = (id: number): ElementoOsm => ({ type: 'node', id, lat: lat(id), lon: lon(id) });
const via = (id: number, nodes: number[], tags: Record<string, string>) =>
  ({ type: 'way', id, nodes, tags }) satisfies ElementoOsm;

const GRILLA = [
  ...[11, 21, 31, 12, 22].map(nodo),
  via(1, [11, 21, 31], { highway: 'residential', name: 'Calle Sur' }),
  via(2, [12, 22], { highway: 'residential', name: 'Calle Norte' }),
  via(3, [11, 12], { highway: 'residential', name: 'Avenida' }),
  via(4, [21, 22], { highway: 'residential', name: 'Calle B', kerb: 'lowered' }),
];

const esquina = (id: number, cambios: Record<string, unknown> = {}) => ({
  id: `E${id}`,
  nombre: `Esquina ${id}`,
  lat: lat(id),
  lon: lon(id),
  nodosOsm: [id],
  fechaImagen: '2025-08',
  rampas: { NO: 'no se ve', NE: 'no se ve', SO: 'no se ve', SE: 'no se ve' },
  semaforo: null,
  pisoPodotactil: null,
  observaciones: null,
  ...cambios,
});

const cuadra = (
  id: string,
  calle: string,
  esquinas: [string, string],
  cambios: Record<string, unknown> = {},
) => ({
  id,
  calle,
  entre: '',
  esquinas,
  fechaImagen: '2025-08',
  veredas: { N: 'buena', S: 'buena' },
  escalones: 'no',
  superficie: null,
  anchoMetros: null,
  pendienteFuerte: 'no',
  pasaSillaDeRuedas: null,
  queLaBloquea: null,
  observaciones: null,
  ...cambios,
});

const punto = (id: string, cambios: Record<string, unknown>) => ({
  id,
  donde: '',
  pregunta: '',
  fechaImagen: null,
  sePasaCaminando: 'sí',
  sePasaEnSilla: 'sí',
  detalle: null,
  lat: -38.95,
  lon: -68.06,
  ...cambios,
});

// Pasa por leerRelevamiento: así cada caso de prueba también tiene que ser un archivo válido.
const relevamiento = (datos: Record<string, unknown> = {}): Relevamiento =>
  leerRelevamiento(
    JSON.stringify({
      zona: 'Prueba',
      metodo: 'Prueba',
      esquinas: [11, 21, 31, 12, 22].map((id) => esquina(id)),
      cuadras: [],
      puntos: [],
      ...datos,
    }),
  );

const tramo = (red: ReturnType<typeof aplicarRelevamiento>, origen: number, destino: number) =>
  red.tramos.find((t) => t.nodoOrigen === origen && t.nodoDestino === destino);

describe('leer el archivo del relevamiento', () => {
  it('acepta un relevamiento con las opciones de la planilla', () => {
    const leido = relevamiento({ cuadras: [cuadra('C1', 'Calle Sur', ['E11', 'E21'])] });

    expect(leido.cuadras[0]).toMatchObject({ id: 'C1', veredas: { N: 'buena', S: 'buena' } });
  });

  it.each([
    ['un valor que no es de la planilla', { superficie: 'cemento' }, 'cuadras.0.superficie'],
    ['veredas N y E mezcladas', { veredas: { N: 'buena', E: 'buena' } }, 'cuadras.0.veredas'],
    ['un ancho imposible', { anchoMetros: 150 }, 'cuadras.0.anchoMetros'],
    ['una esquina que no existe', { esquinas: ['E11', 'E99'] }, 'no existe la esquina E99'],
  ])('rechaza %s y dice dónde está el error', (_caso, cambios, mensaje) => {
    expect(() => relevamiento({ cuadras: [cuadra('C1', 'Calle Sur', ['E11', 'E21'], cambios)] })).toThrow(
      mensaje,
    );
  });

  it('rechaza un archivo que no es JSON', () => {
    expect(() => leerRelevamiento('{ esto no es json')).toThrow('El archivo del relevamiento no es JSON');
  });
});

describe('rampa de una cuadra', () => {
  const rampa = (cambiosCuadra: Record<string, unknown>, oeste: object, este: object) => {
    const leido = relevamiento({
      esquinas: [esquina(11, { rampas: oeste }), esquina(21, { rampas: este })],
      cuadras: [cuadra('C1', 'Calle Sur', ['E21', 'E11'], cambiosCuadra)],
    });
    const [e21, e11] = [leido.esquinas[1]!, leido.esquinas[0]!];
    return rampaDeCuadra(leido.cuadras[0]!, [e21, e11]);
  };
  const todas = (valor: string) => ({ NO: valor, NE: valor, SO: valor, SE: valor });

  it('alcanza con una vereda con rampa en sus dos puntas, aunque la otra no tenga', () => {
    // Vereda N: punta NE de la esquina del oeste y NO de la del este, aunque las esquinas vengan al revés.
    expect(rampa({}, { ...todas('no'), NE: 'sí' }, { ...todas('no'), NO: 'sí' })).toBe(true);
  });

  it('no alcanza con las puntas de veredas distintas', () => {
    expect(rampa({}, { ...todas('no'), NE: 'sí' }, { ...todas('no'), SO: 'sí' })).toBe(false);
  });

  it('una rampa rota o tapada cuenta como que no hay', () => {
    expect(rampa({}, { ...todas('sí'), NE: 'sí, pero mal' }, { ...todas('sí'), SO: 'sí, pero mal' })).toBe(
      false,
    );
  });

  it('una punta donde no se cruza no hace falta', () => {
    expect(rampa({}, { ...todas('no'), NE: 'no corresponde' }, { ...todas('no'), NO: 'sí' })).toBe(true);
  });

  it('si una punta no se vio y no hay otra vereda con rampa, no se decide', () => {
    expect(rampa({}, { ...todas('no'), NE: 'no se ve' }, { ...todas('no'), NO: 'sí' })).toBeNull();
  });

  it('un lado sin vereda no cuenta, aunque sus esquinas tengan rampa', () => {
    expect(
      rampa({ veredas: { N: 'cantero / no aplica', S: 'no hay vereda' } }, todas('sí'), todas('sí')),
    ).toBe(false);
  });

  it('en una calle de sur a norte mira las puntas del oeste y del este', () => {
    const leido = relevamiento({
      esquinas: [
        esquina(11, { rampas: { ...todas('no'), NE: 'sí' } }),
        esquina(12, { rampas: { ...todas('no'), SE: 'sí' } }),
      ],
      cuadras: [cuadra('C1', 'Avenida', ['E11', 'E12'], { veredas: { O: 'buena', E: 'buena' } })],
    });

    expect(rampaDeCuadra(leido.cuadras[0]!, [leido.esquinas[0]!, leido.esquinas[1]!])).toBe(true);
  });
});

describe('superficie de una cuadra', () => {
  const superficie = (cambios: Record<string, unknown>) =>
    superficieDeCuadra(
      relevamiento({ cuadras: [cuadra('C1', 'Calle Sur', ['E11', 'E21'], cambios)] }).cuadras[0]!,
    );

  it.each([
    [{ superficie: 'baldosa' }, 'paving_stones'],
    [{ superficie: 'tierra' }, 'dirt'],
    [{ superficie: 'mixta', pasaSillaDeRuedas: 'no' }, 'unpaved'],
    [{ superficie: 'mixta', pasaSillaDeRuedas: 'solo por un lado' }, 'paved'],
    [{ superficie: 'mixta', pasaSillaDeRuedas: 'no se ve' }, null],
    [{ superficie: 'no se ve' }, null],
    [{ superficie: null }, null],
  ])('%j queda como %j', (cambios, esperada) => {
    expect(superficie(cambios)).toBe(esperada);
  });
});

describe('aplicar el relevamiento a la red', () => {
  const con = { NO: 'sí', NE: 'sí', SO: 'sí', SE: 'sí' };

  it('corrige solo los tramos de la calle de la cuadra que quedan entre sus dos esquinas', () => {
    const red = aplicarRelevamiento(
      armarRed(GRILLA),
      relevamiento({
        esquinas: [11, 21, 31, 12, 22].map((id) => esquina(id, { rampas: con })),
        cuadras: [cuadra('C1', 'Calle Sur', ['E11', 'E21'], { superficie: 'baldosa', anchoMetros: 1.5 })],
      }),
    );

    expect(tramo(red, 11, 21)).toMatchObject({
      tieneRampa: true,
      superficie: 'paving_stones',
      anchoEstimado: 1.5,
    });
    // La otra cuadra de la misma calle y las calles que salen de las esquinas quedan como venían de OSM.
    expect(tramo(red, 21, 31)).toMatchObject({ tieneRampa: false, superficie: null, anchoEstimado: null });
    expect(tramo(red, 11, 12)).toMatchObject({ tieneRampa: false, superficie: null });
    expect(red.resumen).toMatchObject({ tramosCorregidos: 1, sinUbicar: [] });
  });

  it('corrige las dos manos de un bulevar', () => {
    // Dos manos con el mismo nombre, a unos 9 m de cada lado del centro de la esquina.
    const mano = (id: number, nodos: [number, number], corrimiento: number): ElementoOsm[] => [
      ...nodos.map((n) => ({ ...nodo(n), id: id * 100 + n, lat: lat(n) + corrimiento })),
      via(id, [id * 100 + nodos[0], id * 100 + nodos[1]], { highway: 'residential', name: 'Bulevar' }),
    ];
    const red = aplicarRelevamiento(
      armarRed([...mano(7, [11, 21], 0.00008), ...mano(8, [11, 21], -0.00008)]),
      relevamiento({
        esquinas: [esquina(11, { nodosOsm: [711, 811] }), esquina(21, { nodosOsm: [721, 821] })],
        cuadras: [cuadra('C1', 'Bulevar', ['E11', 'E21'], { superficie: 'hormigón' })],
      }),
    );

    expect(red.tramos.map((t) => t.superficie)).toEqual(['concrete', 'concrete']);
  });

  it('lo que no se vio deja el valor de OSM', () => {
    const red = aplicarRelevamiento(
      armarRed(GRILLA),
      relevamiento({
        cuadras: [cuadra('C1', 'Calle B', ['E21', 'E22'], { veredas: { O: 'buena', E: 'buena' } })],
      }),
    );

    // Calle B trae cordón rebajado de OSM y las esquinas no se vieron.
    expect(tramo(red, 21, 22)).toMatchObject({ tieneRampa: true, superficie: null });
    expect(red.resumen.tramosCorregidos).toBe(0);
  });

  it('corrige el piso podotáctil de los nodos de cada esquina', () => {
    const red = aplicarRelevamiento(
      armarRed(GRILLA),
      relevamiento({
        esquinas: [
          esquina(11, { pisoPodotactil: 'sí' }),
          esquina(21, { pisoPodotactil: 'no' }),
          esquina(31, { pisoPodotactil: 'no se ve' }),
        ],
      }),
    );

    expect(red.nodos.filter((n) => n.tienePisoPodotactil).map((n) => n.osmId)).toEqual([11]);
    expect(red.resumen.nodosCorregidos).toBe(2);
  });

  it('quita los caminos que no son públicos', () => {
    const red = aplicarRelevamiento(
      armarRed(GRILLA),
      relevamiento({ puntos: [punto('P1', { quitarCaminos: ['way/1'] })] }),
    );

    expect(red.tramos.some((t) => t.camino === 'way/1')).toBe(false);
    expect(red.resumen.tramosQuitados).toBe(2);
  });

  it('une dos nodos que en la realidad se conectan, una sola vez', () => {
    const leido = relevamiento({
      puntos: [punto('P1', { conectarNodos: [31, 22] }), punto('P2', { conectarNodos: [11, 21] })],
    });
    const red = aplicarRelevamiento(armarRed(GRILLA), leido);

    expect(tramo(red, 31, 22)).toMatchObject({
      camino: 'relevamiento/P1',
      tipo: 'VEREDA',
      puntos: [
        [lon(31), lat(31)],
        [lon(22), lat(22)],
      ],
    });
    // 11 y 21 ya están unidos por Calle Sur: no se agrega otro tramo.
    expect(red.resumen.conexionesAgregadas).toBe(1);
  });

  it('avisa lo que no encuentra en la red y aplica el resto', () => {
    const red = aplicarRelevamiento(
      armarRed(GRILLA),
      relevamiento({
        esquinas: [...[11, 21].map((id) => esquina(id)), esquina(99, { nodosOsm: [999] })],
        cuadras: [
          cuadra('C1', 'Calle Que No Está', ['E11', 'E21']),
          cuadra('C2', 'Calle Sur', ['E11', 'E21'], { superficie: 'tierra' }),
        ],
        puntos: [punto('P1', { quitarCaminos: ['way/55'] }), punto('P2', { conectarNodos: [11, 999] })],
      }),
    );

    expect(red.resumen.sinUbicar).toEqual(['P1', 'P2', 'C1', 'E99']);
    expect(tramo(red, 11, 21)).toMatchObject({ superficie: 'dirt' });
  });

  it('no cambia la red que recibe', () => {
    const original = armarRed(GRILLA);
    const copia = structuredClone(original);

    aplicarRelevamiento(
      original,
      relevamiento({
        esquinas: [11, 21, 31, 12, 22].map((id) => esquina(id, { rampas: con, pisoPodotactil: 'sí' })),
        cuadras: [cuadra('C1', 'Calle Sur', ['E11', 'E21'], { superficie: 'tierra' })],
        puntos: [punto('P1', { quitarCaminos: ['way/2'], conectarNodos: [31, 22] })],
      }),
    );

    expect(original).toEqual(copia);
  });
});
