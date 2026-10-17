import { describe, expect, it } from 'vitest';
import { leerRespuestaOverpass, type ElementoOsm } from '../src/modulos/red/overpass.js';
import { aPuntosInteres, CONSULTA_PUNTOS_INTERES } from '../src/modulos/red/puntosInteres.js';
import { describirResumen } from '../src/modulos/red/servicio.js';

const nodo = (id: number, tags: Record<string, string>): ElementoOsm => ({
  type: 'node',
  id,
  lat: -38.95,
  lon: -68.06,
  tags,
});

describe('consulta de puntos de interés', () => {
  it('pide nodos, vías y relaciones de cada etiqueta dentro del Municipio de Neuquén, con su centro', () => {
    expect(CONSULTA_PUNTOS_INTERES).toContain('area(id:3603201700)->.ciudad;');
    expect(CONSULTA_PUNTOS_INTERES.match(/nwr\[/g)).toHaveLength(8);
    expect(CONSULTA_PUNTOS_INTERES).toContain('nwr["highway"="bus_stop"](area.ciudad);');
    expect(CONSULTA_PUNTOS_INTERES).toContain('out tags center;');
  });
});

describe('aPuntosInteres', () => {
  it.each([
    ['amenity', 'school', 'ESCUELA'],
    ['amenity', 'kindergarten', 'ESCUELA'],
    ['amenity', 'hospital', 'CENTRO_SALUD'],
    ['amenity', 'clinic', 'CENTRO_SALUD'],
    ['amenity', 'doctors', 'CENTRO_SALUD'],
    ['highway', 'bus_stop', 'PARADA_TRANSPORTE'],
    ['amenity', 'townhall', 'EDIFICIO_PUBLICO'],
    ['office', 'government', 'EDIFICIO_PUBLICO'],
  ])('%s=%s es %s', (clave, valor, tipo) => {
    const { puntos } = aPuntosInteres([nodo(1, { [clave]: valor, name: 'Lugar' })]);
    expect(puntos).toEqual([{ osmId: 1, tipo, nombre: 'Lugar', lat: -38.95, lon: -68.06 }]);
  });

  it('con dos etiquetas gana la más específica: un centro de salud del gobierno es CENTRO_SALUD', () => {
    const { puntos } = aPuntosInteres([nodo(1, { office: 'government', amenity: 'clinic', name: 'CAPS' })]);
    expect(puntos[0]?.tipo).toBe('CENTRO_SALUD');
  });

  it('un nodo usa sus coordenadas; un área (vía o relación), su centro', () => {
    const { puntos } = aPuntosInteres([
      {
        type: 'way',
        id: 2,
        center: { lat: -38.94, lon: -68.07 },
        tags: { amenity: 'school', name: 'EPET 8' },
      },
      { type: 'relation', id: 3, center: { lat: -38.93, lon: -68.08 }, tags: { amenity: 'hospital' } },
    ]);
    expect(puntos.map(({ lat, lon }) => [lat, lon])).toEqual([
      [-38.94, -68.07],
      [-38.93, -68.08],
    ]);
  });

  it('descarta lo que no tiene coordenadas o no tiene una etiqueta conocida, y dice por qué', () => {
    const { puntos, descartados } = aPuntosInteres([
      { type: 'way', id: 4, tags: { amenity: 'school', name: 'Sin centro' } },
      nodo(5, { amenity: 'pharmacy', name: 'Farmacia' }),
      { type: 'node', id: 6, lat: -38.95, lon: -68.06 },
    ]);
    expect(puntos).toEqual([]);
    expect(descartados).toEqual([
      { elemento: 'way/4', motivo: 'no tiene coordenadas' },
      { elemento: 'node/5', motivo: 'no tiene una etiqueta de punto de interés' },
      { elemento: 'node/6', motivo: 'no tiene una etiqueta de punto de interés' },
    ]);
  });

  it('sin nombre, o con un nombre en blanco, usa el de su tipo', () => {
    const { puntos } = aPuntosInteres([
      nodo(1, { amenity: 'school' }),
      nodo(2, { amenity: 'doctors', name: '   ' }),
      nodo(3, { highway: 'bus_stop' }),
      nodo(4, { office: 'government', name: '' }),
    ]);
    expect(puntos.map((p) => p.nombre)).toEqual([
      'Escuela',
      'Centro de salud',
      'Parada de colectivo',
      'Edificio público',
    ]);
  });

  it('limpia los espacios del nombre y lo recorta a 150 caracteres sin partir una letra', () => {
    const largo = 'á'.repeat(149) + '😀😀';
    const { puntos } = aPuntosInteres([
      nodo(1, { amenity: 'school', name: '  Escuela   N° 123 ' }),
      nodo(2, { amenity: 'school', name: largo }),
    ]);
    expect(puntos[0]?.nombre).toBe('Escuela N° 123');
    expect(Array.from(puntos[1]!.nombre)).toHaveLength(150);
    expect(puntos[1]?.nombre).toBe('á'.repeat(149) + '😀');
  });

  it('si un nodo y un área comparten el número, carga el primero y avisa del otro', () => {
    const { puntos, descartados } = aPuntosInteres([
      nodo(7, { highway: 'bus_stop', name: 'Parada' }),
      { type: 'way', id: 7, center: { lat: -38.9, lon: -68 }, tags: { amenity: 'school', name: 'Escuela' } },
    ]);
    expect(puntos).toHaveLength(1);
    expect(puntos[0]?.tipo).toBe('PARADA_TRANSPORTE');
    expect(descartados).toEqual([{ elemento: 'way/7', motivo: 'el osm_id 7 ya lo usa node/7' }]);
  });

  it('sin elementos no hay puntos ni descartes', () => {
    expect(aPuntosInteres([])).toEqual({ puntos: [], descartados: [] });
  });
});

describe('leerRespuestaOverpass', () => {
  it('devuelve los elementos y la fecha de los datos de OSM', () => {
    const texto = JSON.stringify({
      osm3s: { timestamp_osm_base: '2026-10-17T03:04:06Z' },
      elements: [nodo(1, { amenity: 'school' })],
    });
    expect(leerRespuestaOverpass(texto)).toEqual({
      elementos: [nodo(1, { amenity: 'school' })],
      fechaDatos: '2026-10-17T03:04:06Z',
    });
  });

  it('rechaza lo que no es JSON o no tiene elementos', () => {
    expect(() => leerRespuestaOverpass('<html>504 Gateway Timeout</html>')).toThrow('no es JSON');
    expect(() => leerRespuestaOverpass('{"version":0.6}')).toThrow('no tiene la forma esperada');
  });

  it('rechaza una respuesta cortada por tiempo, aunque traiga elementos', () => {
    const texto = JSON.stringify({
      remark: 'runtime error: Query timed out in "query" at line 3 after 120 seconds.',
      elements: [nodo(1, { amenity: 'school' })],
    });
    expect(() => leerRespuestaOverpass(texto)).toThrow('Overpass no terminó la consulta');
  });
});

describe('describirResumen', () => {
  it('informa cuántos puntos de cada tipo cargó, los descartados y los que no vinieron', () => {
    const texto = describirResumen({
      origen: 'archivo',
      fechaDatos: '2026-10-17T03:04:06Z',
      porTipo: {
        ESCUELA: { nuevos: 2, actualizados: 184 },
        CENTRO_SALUD: { nuevos: 0, actualizados: 92 },
        PARADA_TRANSPORTE: { nuevos: 10, actualizados: 1304 },
        EDIFICIO_PUBLICO: { nuevos: 0, actualizados: 0 },
      },
      descartados: [{ elemento: 'way/4', motivo: 'no tiene coordenadas' }],
      ausentes: 1,
    });
    const lineas = texto.split('\n');

    expect(lineas[0]).toBe(
      'Puntos de interés cargados desde la respuesta guardada (datos de OSM al 2026-10-17T03:04:06Z):',
    );
    expect(lineas).toContain('  ESCUELA                 2           184    186');
    expect(lineas).toContain('  PARADA_TRANSPORTE      10          1304   1314');
    expect(lineas).toContain('  EDIFICIO_PUBLICO        0             0      0');
    expect(lineas).toContain('  Total                  12          1580   1592');
    expect(lineas).toContain('  way/4: no tiene coordenadas');
    expect(lineas).toContain('1 punto de la base no vino en esta carga. No se borra.');
  });
});
