import { describe, expect, it } from 'vitest';
import { aParametros, leerFiltros } from '../src/funcionalidades/bandeja/filtros.js';

const leer = (consulta: string) => leerFiltros(new URLSearchParams(consulta));

describe('filtros de la bandeja en la URL', () => {
  it('sin parámetros no hay filtros: el servidor usa el área del operador', () => {
    expect(leer('')).toEqual({});
    expect(aParametros({}).toString()).toBe('');
  });

  it('lee área, estado y categoría', () => {
    expect(leer('areaId=2&estado=DERIVADO&categoriaId=3')).toEqual({
      areaId: 2,
      estado: 'DERIVADO',
      categoriaId: 3,
    });
  });

  it('«todas» pide todo el organismo', () => {
    expect(leer('areaId=todas')).toEqual({ areaId: 'todas' });
  });

  it.each([
    ['un estado que la bandeja no trae', 'estado=RESUELTO'],
    ['un estado inventado', 'estado=cualquiera'],
    ['un id que no es número', 'categoriaId=abc'],
    ['un id cero', 'areaId=0'],
    ['un id negativo', 'areaId=-2'],
    ['un id con decimales', 'categoriaId=1.5'],
    ['un id que no entra en la base', 'categoriaId=2147483648'],
  ])('descarta %s', (_caso, consulta) => {
    expect(leer(consulta)).toEqual({});
  });

  it('el id más grande que entra en la base sí vale', () => {
    expect(leer('categoriaId=2147483647')).toEqual({ categoriaId: 2147483647 });
  });

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const filtros = { areaId: 'todas' as const, estado: 'EN_EJECUCION' as const, categoriaId: 4 };
    expect(leerFiltros(aParametros(filtros))).toEqual(filtros);
  });
});
