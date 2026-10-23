import type { EstadoIncidente } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { estadoSegunReportes } from '../src/modulos/agrupacion/calculo.js';
import { transicionValida, type ViaTransicion } from '../src/modulos/incidentes/calculo.js';

const ESTADOS: EstadoIncidente[] = [
  'REGISTRADO',
  'VERIFICADO',
  'DERIVADO',
  'EN_EJECUCION',
  'RESUELTO',
  'DESESTIMADO',
];
const VIAS: ViaTransicion[] = ['OPERADOR', 'REPORTES', 'CIERRE'];

// El diagrama de docs/calculos.md escrito a mano: cualquier otra combinación es inválida.
const VALIDAS = new Set([
  'REGISTRADO→VERIFICADO por REPORTES',
  'REGISTRADO→DESESTIMADO por REPORTES',
  'REGISTRADO→DESESTIMADO por OPERADOR',
  'VERIFICADO→REGISTRADO por REPORTES',
  'VERIFICADO→DERIVADO por OPERADOR',
  'VERIFICADO→DESESTIMADO por REPORTES',
  'VERIFICADO→DESESTIMADO por OPERADOR',
  'DERIVADO→DERIVADO por OPERADOR',
  'DERIVADO→EN_EJECUCION por OPERADOR',
  'DERIVADO→DESESTIMADO por OPERADOR',
  'EN_EJECUCION→RESUELTO por CIERRE',
  'EN_EJECUCION→DESESTIMADO por OPERADOR',
]);

const combinaciones = ESTADOS.flatMap((desde) =>
  ESTADOS.flatMap((hacia) => VIAS.map((via) => ({ desde, hacia, via }))),
);

describe('transicionValida', () => {
  it.each(combinaciones)('$desde → $hacia por $via', ({ desde, hacia, via }) => {
    expect(transicionValida(desde, hacia, via)).toBe(VALIDAS.has(`${desde}→${hacia} por ${via}`));
  });

  it.each(['RESUELTO', 'DESESTIMADO'] as const)('%s no sale de su estado por ninguna vía', (desde) => {
    for (const hacia of ESTADOS) {
      for (const via of VIAS) expect(transicionValida(desde, hacia, via)).toBe(false);
    }
  });

  it('a RESUELTO solo se llega por el cierre, y solo desde EN_EJECUCION', () => {
    const hastaResuelto = combinaciones.filter(
      ({ desde, hacia, via }) => hacia === 'RESUELTO' && transicionValida(desde, hacia, via),
    );
    expect(hastaResuelto).toEqual([{ desde: 'EN_EJECUCION', hacia: 'RESUELTO', via: 'CIERRE' }]);
  });

  it('el operador no puede volver un incidente a REGISTRADO ni verificarlo a mano', () => {
    for (const desde of ESTADOS) {
      expect(transicionValida(desde, 'REGISTRADO', 'OPERADOR')).toBe(false);
      expect(transicionValida(desde, 'VERIFICADO', 'OPERADOR')).toBe(false);
    }
  });

  it('para pasar a EN_EJECUCION primero hay que derivar', () => {
    expect(transicionValida('VERIFICADO', 'EN_EJECUCION', 'OPERADOR')).toBe(false);
    expect(transicionValida('DERIVADO', 'EN_EJECUCION', 'OPERADOR')).toBe(true);
  });

  it('no se deriva desde EN_EJECUCION ni desde REGISTRADO', () => {
    expect(transicionValida('EN_EJECUCION', 'DERIVADO', 'OPERADOR')).toBe(false);
    expect(transicionValida('REGISTRADO', 'DERIVADO', 'OPERADOR')).toBe(false);
  });

  it('todo lo que decide estadoSegunReportes es una transición válida por reportes', () => {
    const casos = [
      { validos: 0, verificados: 0 },
      { validos: 2, verificados: 0 },
      { validos: 2, verificados: 1 },
    ];
    for (const desde of ESTADOS) {
      for (const reportes of casos) {
        const hacia = estadoSegunReportes(desde, reportes);
        if (hacia !== desde) expect(transicionValida(desde, hacia, 'REPORTES')).toBe(true);
      }
    }
  });
});
