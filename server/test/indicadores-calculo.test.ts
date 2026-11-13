import { describe, expect, it } from 'vitest';
import {
  abiertosPorEstado,
  ordenarBarrios,
  pesosDeCalor,
  porcentaje,
  type Resuelto,
  tiemposDeResolucion,
} from '../src/modulos/indicadores/calculo.js';

/** Un resuelto de la categoría 1 y el área 1 en el Centro, salvo lo que se pise. */
const resuelto = (dias: number, datos: Partial<Resuelto> = {}): Resuelto => ({
  categoriaId: 1,
  categoriaNombre: 'Pozo',
  areaId: 1,
  areaNombre: 'Bacheo',
  barrio: 'Centro',
  dias,
  ...datos,
});

describe('abiertosPorEstado', () => {
  it('devuelve los cuatro estados en el orden del circuito, también los que no tienen incidentes', () => {
    expect(abiertosPorEstado([{ estado: 'DERIVADO', cantidad: 3 }])).toEqual([
      { estado: 'REGISTRADO', cantidad: 0 },
      { estado: 'VERIFICADO', cantidad: 0 },
      { estado: 'DERIVADO', cantidad: 3 },
      { estado: 'EN_EJECUCION', cantidad: 0 },
    ]);
    expect(abiertosPorEstado([]).every((fila) => fila.cantidad === 0)).toBe(true);
  });
});

describe('tiemposDeResolucion', () => {
  it('sin resueltos, las tres listas quedan vacías', () => {
    expect(tiemposDeResolucion([])).toEqual({ porCategoria: [], porArea: [], porBarrio: [] });
  });

  it('con cantidad impar, la mediana es el del medio, aunque lleguen desordenados', () => {
    const { porCategoria } = tiemposDeResolucion([resuelto(9), resuelto(2), resuelto(4)]);
    expect(porCategoria).toEqual([{ id: 1, nombre: 'Pozo', cantidad: 3, medianaDias: 4, promedioDias: 5 }]);
  });

  it('con cantidad par, la mediana es el promedio de los dos del medio', () => {
    const { porCategoria } = tiemposDeResolucion([resuelto(1), resuelto(10), resuelto(4), resuelto(3)]);
    expect(porCategoria[0]).toMatchObject({ cantidad: 4, medianaDias: 3.5, promedioDias: 4.5 });
  });

  it('con uno solo, la mediana y el promedio son ese valor', () => {
    const { porCategoria } = tiemposDeResolucion([resuelto(2.25)]);
    expect(porCategoria[0]).toMatchObject({ cantidad: 1, medianaDias: 2.3, promedioDias: 2.3 });
  });

  it('redondea a un decimal: 14 días en 3 incidentes son 4,7 de promedio', () => {
    const { porCategoria } = tiemposDeResolucion([resuelto(9), resuelto(1), resuelto(4)]);
    expect(porCategoria[0]).toMatchObject({ medianaDias: 4, promedioDias: 4.7 });
  });

  it('un incidente resuelto en horas cuenta la fracción de día', () => {
    // 6 horas y 18 horas.
    const { porCategoria } = tiemposDeResolucion([resuelto(0.25), resuelto(0.75)]);
    expect(porCategoria[0]).toMatchObject({ medianaDias: 0.5, promedioDias: 0.5 });
  });

  it('agrupa por categoría, por área y por barrio, cada uno por su lado', () => {
    const tiempos = tiemposDeResolucion([
      resuelto(4),
      resuelto(2, { areaId: 2, areaNombre: 'Veredas', barrio: 'Bouquet Roldán' }),
      resuelto(1, { categoriaId: 2, categoriaNombre: 'Vereda rota', areaId: 2, areaNombre: 'Veredas' }),
    ]);
    expect(tiempos.porCategoria).toEqual([
      { id: 1, nombre: 'Pozo', cantidad: 2, medianaDias: 3, promedioDias: 3 },
      { id: 2, nombre: 'Vereda rota', cantidad: 1, medianaDias: 1, promedioDias: 1 },
    ]);
    expect(tiempos.porArea).toEqual([
      { id: 1, nombre: 'Bacheo', cantidad: 1, medianaDias: 4, promedioDias: 4 },
      { id: 2, nombre: 'Veredas', cantidad: 2, medianaDias: 1.5, promedioDias: 1.5 },
    ]);
    expect(tiempos.porBarrio).toEqual([
      { barrio: 'Centro', cantidad: 2, medianaDias: 2.5, promedioDias: 2.5 },
      { barrio: 'Bouquet Roldán', cantidad: 1, medianaDias: 2, promedioDias: 2 },
    ]);
  });

  it('un resuelto sin dirección cuenta en su categoría y su área, pero en ningún barrio', () => {
    const tiempos = tiemposDeResolucion([resuelto(3, { barrio: null })]);
    expect(tiempos.porCategoria).toHaveLength(1);
    expect(tiempos.porArea).toHaveLength(1);
    expect(tiempos.porBarrio).toEqual([]);
  });

  it('primero el que más tarda y, ante un empate, en orden alfabético castellano', () => {
    const { porArea } = tiemposDeResolucion([
      resuelto(2, { areaId: 1, areaNombre: 'Bacheo' }),
      resuelto(2, { areaId: 2, areaNombre: 'Área verde' }),
      resuelto(5, { areaId: 3, areaNombre: 'Veredas' }),
    ]);
    // Con < de JavaScript, «Área» quedaría después de «Bacheo»: la Á tiene un código mayor que la B.
    expect(porArea.map((area) => area.nombre)).toEqual(['Veredas', 'Área verde', 'Bacheo']);
  });
});

describe('ordenarBarrios', () => {
  it('de más a menos incidentes abiertos y, ante un empate, por nombre', () => {
    expect(
      ordenarBarrios([
        { barrio: 'Villa Farrell', cantidad: 1 },
        { barrio: 'Centro', cantidad: 2 },
        { barrio: 'Ñandú', cantidad: 1 },
        { barrio: 'Bouquet Roldán', cantidad: 1 },
      ]),
    ).toEqual([
      { barrio: 'Centro', cantidad: 2 },
      { barrio: 'Bouquet Roldán', cantidad: 1 },
      { barrio: 'Ñandú', cantidad: 1 },
      { barrio: 'Villa Farrell', cantidad: 1 },
    ]);
  });
});

describe('porcentaje', () => {
  it('con un decimal', () => {
    expect(porcentaje(3, 5)).toBe(60);
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(2, 3)).toBe(66.7);
    expect(porcentaje(0, 4)).toBe(0);
    expect(porcentaje(4, 4)).toBe(100);
  });

  it('sin total no hay porcentaje: null, no 0', () => {
    expect(porcentaje(0, 0)).toBeNull();
  });
});

describe('pesosDeCalor', () => {
  it('cada prioridad sobre la mayor, con dos decimales', () => {
    expect(pesosDeCalor([20, 40, 80, 12])).toEqual([0.25, 0.5, 1, 0.15]);
  });

  it('una prioridad de más de 100 pesa 1 y las demás se miden contra ella', () => {
    expect(pesosDeCalor([150, 100])).toEqual([1, 0.67]);
  });

  it('si todas son 0, todas pesan lo mismo', () => {
    expect(pesosDeCalor([0, 0])).toEqual([1, 1]);
  });

  it('sin puntos no hay pesos', () => {
    expect(pesosDeCalor([])).toEqual([]);
  });
});
