import { describe, expect, it } from 'vitest';
import { armarDireccion, extraerBarrio, SIN_BARRIO } from '../src/modulos/geocodificacion/calculo.js';

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
