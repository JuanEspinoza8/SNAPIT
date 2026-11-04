import { describe, expect, it } from 'vitest';
import {
  aLugares,
  armarDireccion,
  esDeNeuquenCapital,
  extraerBarrio,
  nombreDelLugar,
  type ResultadoBusqueda,
  SIN_BARRIO,
} from '../src/modulos/geocodificacion/calculo.js';

describe('armarDireccion', () => {
  it('calle, altura y barrio', () => {
    expect(
      armarDireccion({ road: 'Avenida Argentina', house_number: '250', suburb: 'Área Centro Este' }),
    ).toBe('Avenida Argentina 250, Área Centro Este');
  });

  it('sin altura, solo la calle', () => {
    expect(armarDireccion({ road: 'Lago Huechulafquen', suburb: 'Villa Ceferino' })).toBe(
      'Lago Huechulafquen, Villa Ceferino',
    );
  });

  it('sin barrio queda "Sin barrio"', () => {
    expect(armarDireccion({ road: 'Ruta 22', house_number: '1500', city: 'Neuquén' })).toBe(
      'Ruta 22 1500, Sin barrio',
    );
  });

  it('sin calle queda solo el barrio', () => {
    expect(armarDireccion({ suburb: 'Bouquet Roldán', city: 'Neuquén' })).toBe('Bouquet Roldán');
  });

  it('sin calle ni barrio, o sin respuesta, queda "Sin barrio"', () => {
    expect(armarDireccion({ city: 'Neuquén', country: 'Argentina' })).toBe(SIN_BARRIO);
    expect(armarDireccion({})).toBe(SIN_BARRIO);
    expect(armarDireccion(null)).toBe(SIN_BARRIO);
  });

  it('el barrio sale de suburb; si no hay, de city_district, quarter o neighbourhood, en ese orden', () => {
    expect(armarDireccion({ road: 'Lanín', suburb: 'A', city_district: 'B', neighbourhood: 'C' })).toBe(
      'Lanín, A',
    );
    expect(armarDireccion({ road: 'Lanín', city_district: 'Valentina Sur Rural', neighbourhood: 'C' })).toBe(
      'Lanín, Valentina Sur Rural',
    );
    expect(armarDireccion({ road: 'Lanín', quarter: 'Q', neighbourhood: 'C' })).toBe('Lanín, Q');
    expect(armarDireccion({ road: 'Lanín', neighbourhood: 'C' })).toBe('Lanín, C');
  });

  it('una senda peatonal sirve como calle si no hay road', () => {
    expect(armarDireccion({ footway: 'Paseo Costero', suburb: 'Río Grande' })).toBe(
      'Paseo Costero, Río Grande',
    );
  });

  it('saca las comas de los nombres: la última coma tiene que separar el barrio', () => {
    const direccion = armarDireccion({ road: 'Calle 1, sector 2', suburb: 'Barrio, norte' });

    expect(direccion).toBe('Calle 1 sector 2, Barrio norte');
    expect(extraerBarrio(direccion)).toBe('Barrio norte');
  });

  it('ignora valores vacíos o que no son texto', () => {
    expect(armarDireccion({ road: '  ', house_number: 12, suburb: '' })).toBe(SIN_BARRIO);
  });

  it('si es muy larga recorta la calle y deja el barrio entero, en 250 caracteres', () => {
    const direccion = armarDireccion({ road: 'x'.repeat(400), suburb: 'Villa Farrell' });

    expect(direccion).toHaveLength(250);
    expect(direccion.endsWith(', Villa Farrell')).toBe(true);
    expect(extraerBarrio(direccion)).toBe('Villa Farrell');
  });

  it('un barrio larguísimo se corta a 100 caracteres', () => {
    const direccion = armarDireccion({ road: 'Calle', suburb: 'b'.repeat(300) });

    expect(direccion).toBe(`Calle, ${'b'.repeat(100)}`);
  });
});

describe('extraerBarrio', () => {
  it.each([
    ['Avenida Argentina 250, Área Centro Este', 'Área Centro Este'],
    ['Ruta 22 1500, Sin barrio', SIN_BARRIO],
    ['Bouquet Roldán', 'Bouquet Roldán'],
    [SIN_BARRIO, SIN_BARRIO],
    ['Una, dos, Tres', 'Tres'],
    ['Calle 1,   Espacios  ', 'Espacios'],
    ['Calle 1, ', SIN_BARRIO],
    ['', SIN_BARRIO],
  ])('%j → %j', (direccion, barrio) => {
    expect(extraerBarrio(direccion)).toBe(barrio);
  });
});

// Resultados de verdad de Nominatim para "Saavedra 500" y "Hospital Bouquet Roldán" (02/11/2026), recortados.
const SAAVEDRA_NEUQUEN: ResultadoBusqueda = {
  lat: -38.9601407,
  lon: -68.0897074,
  name: '',
  address: {
    house_number: '500',
    road: 'Cornelio Saavedra',
    suburb: 'La Sirena',
    city: 'Neuquén',
    municipality: 'Municipio de Neuquén',
    state: 'Neuquén',
  },
};
// Del otro lado del río, pero dentro del rectángulo del municipio de Neuquén.
const SAAVEDRA_CIPOLLETTI: ResultadoBusqueda = {
  lat: -38.9299352,
  lon: -68.008819,
  name: '',
  address: {
    house_number: '500',
    road: 'Saavedra',
    suburb: '12 de Septiembre',
    city_district: 'Cipolletti',
    city: 'Municipio de Cipolletti',
    state: 'Río Negro',
  },
};
const SAAVEDRA_FERNANDEZ_ORO: ResultadoBusqueda = {
  lat: -38.9520285,
  lon: -67.9265145,
  name: '',
  address: { house_number: '500', road: 'Saavedra', town: 'General Fernández Oro', state: 'Río Negro' },
};
const HOSPITAL: ResultadoBusqueda = {
  lat: -38.9583823,
  lon: -68.0859225,
  name: 'Hospital de Área Programa Neuquén "Bouquet Roldán"',
  address: {
    house_number: '1915',
    road: 'Doctor Luis Teodoro Planas',
    neighbourhood: 'Vidor',
    suburb: 'Bouquet Roldán',
    city: 'Neuquén',
    municipality: 'Municipio de Neuquén',
  },
};

describe('esDeNeuquenCapital', () => {
  it('reconoce la ciudad por city o por municipality', () => {
    expect(esDeNeuquenCapital({ city: 'Neuquén' })).toBe(true);
    expect(esDeNeuquenCapital({ municipality: 'Municipio de Neuquén' })).toBe(true);
  });

  it('no confunde la provincia con la ciudad, ni acepta otras ciudades', () => {
    expect(esDeNeuquenCapital({ town: 'Plottier', state: 'Neuquén' })).toBe(false);
    expect(esDeNeuquenCapital(SAAVEDRA_CIPOLLETTI.address)).toBe(false);
    expect(esDeNeuquenCapital(undefined)).toBe(false);
  });
});

describe('nombreDelLugar', () => {
  it('una dirección queda como "<calle> <altura>, <barrio>"', () => {
    expect(nombreDelLugar(SAAVEDRA_NEUQUEN)).toBe('Cornelio Saavedra 500, La Sirena');
  });

  it('un lugar con nombre propio lo pone adelante', () => {
    expect(nombreDelLugar(HOSPITAL)).toBe(
      'Hospital de Área Programa Neuquén "Bouquet Roldán", Doctor Luis Teodoro Planas 1915, Bouquet Roldán',
    );
  });

  it('una calle no repite su nombre', () => {
    const calle = {
      lat: -38.96,
      lon: -68.09,
      name: 'Cornelio Saavedra',
      address: { road: 'Cornelio Saavedra', suburb: 'La Sirena' },
    };

    expect(nombreDelLugar(calle)).toBe('Cornelio Saavedra, La Sirena');
  });
});

describe('aLugares', () => {
  it('no deja pasar resultados fuera de Neuquén, aunque caigan dentro del rectángulo de la ciudad', () => {
    const lugares = aLugares([SAAVEDRA_FERNANDEZ_ORO, SAAVEDRA_CIPOLLETTI, SAAVEDRA_NEUQUEN]);

    expect(lugares).toEqual([
      { nombre: 'Cornelio Saavedra 500, La Sirena', lat: -38.9601407, lon: -68.0897074 },
    ]);
  });

  it('no deja pasar un resultado que dice ser de Neuquén pero cae fuera del rectángulo', () => {
    expect(aLugares([{ ...SAAVEDRA_NEUQUEN, lat: -38.5 }])).toEqual([]);
  });

  it('devuelve como mucho 5, en el orden de Nominatim', () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({ ...HOSPITAL, lat: HOSPITAL.lat + i * 0.0001 }));

    const lugares = aLugares(muchos);

    expect(lugares.map((lugar) => lugar.lat)).toEqual(muchos.slice(0, 5).map((r) => r.lat));
  });
});
