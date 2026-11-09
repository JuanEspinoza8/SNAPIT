import { describe, expect, it } from 'vitest';
import {
  type DatosDelCierre,
  decidirCierre,
  explicarCierre,
  type ParametrosCierre,
  type VeredictoCierre,
} from '../src/modulos/cierre/calculo.js';

// El valor de partida de la semilla (docs/calculos.md).
const p: ParametrosCierre = { distanciaMaxM: 50 };

describe('decidirCierre', () => {
  it('sin GPS en la foto queda OBSERVADO, aunque la IA diga RESUELTO', () => {
    expect(decidirCierre(null, 'RESUELTO', p)).toBe('OBSERVADO');
  });

  it('una distancia mayor que el máximo queda RECHAZADO, aunque la IA diga RESUELTO', () => {
    expect(decidirCierre(50.01, 'RESUELTO', p)).toBe('RECHAZADO');
  });

  it('la distancia justo en el límite no rechaza', () => {
    expect(decidirCierre(50, 'RESUELTO', p)).toBe('VALIDADO');
  });

  it('si la IA se cayó queda OBSERVADO', () => {
    expect(decidirCierre(10, null, p)).toBe('OBSERVADO');
  });

  it('RESUELTO valida', () => {
    expect(decidirCierre(10, 'RESUELTO', p)).toBe('VALIDADO');
  });

  it('NO_RESUELTO rechaza', () => {
    expect(decidirCierre(10, 'NO_RESUELTO', p)).toBe('RECHAZADO');
  });

  it('NO_CONCLUYENTE deja OBSERVADO', () => {
    expect(decidirCierre(10, 'NO_CONCLUYENTE', p)).toBe('OBSERVADO');
  });

  it('sin GPS gana sobre la IA caída', () => {
    expect(decidirCierre(null, null, p)).toBe('OBSERVADO');
  });

  it('la distancia fuera de rango gana sobre el veredicto de la IA', () => {
    expect(decidirCierre(50.01, 'NO_CONCLUYENTE', p)).toBe('RECHAZADO');
  });
});

describe('explicarCierre', () => {
  const sinIa = (distancia: number | null, sinComparacion: string | null = null): DatosDelCierre => ({
    distancia,
    comparacion: null,
    sinComparacion,
  });
  const conIa = (distancia: number, veredicto: VeredictoCierre): DatosDelCierre => ({
    distancia,
    comparacion: { veredicto, explicacion: 'El pozo está tapado.' },
    sinComparacion: null,
  });

  it('sin GPS dice que no se puede comprobar el lugar y que espera confirmación', () => {
    const texto = explicarCierre('OBSERVADO', sinIa(null), p);
    expect(texto).toContain('no trae la ubicación');
    expect(texto).toContain('otro operador lo confirme');
  });

  it('apenas pasado el máximo, la distancia se redondea para arriba: nunca dice estar dentro', () => {
    expect(explicarCierre('RECHAZADO', sinIa(50.01), p)).toBe(
      'La foto se sacó a 51 m del incidente, y el máximo es 50 m: tiene que ser del mismo lugar.',
    );
  });

  it('justo en el máximo es del lugar, y un validado nunca dice más que el máximo', () => {
    expect(explicarCierre('VALIDADO', conIa(50, 'RESUELTO'), p)).toMatch(
      /^La foto es del lugar \(a 50 m\)\./,
    );
    expect(explicarCierre('VALIDADO', conIa(49.2, 'RESUELTO'), p)).toMatch(
      /^La foto es del lugar \(a 50 m\)\./,
    );
  });

  it('sin comparación dice por qué, o que la IA no respondió', () => {
    expect(explicarCierre('OBSERVADO', sinIa(10, 'la IA no está disponible'), p)).toContain(
      'No se pudo comparar con el antes (la IA no está disponible)',
    );
    expect(explicarCierre('OBSERVADO', sinIa(10), p)).toContain('(la IA no respondió)');
  });

  it('con la comparación, dice qué concluyó y suma la explicación de la IA', () => {
    expect(explicarCierre('VALIDADO', conIa(10, 'RESUELTO'), p)).toBe(
      'La foto es del lugar (a 10 m). La comparación con el antes dice que está resuelto. El pozo está tapado.',
    );
    expect(explicarCierre('RECHAZADO', conIa(10, 'NO_RESUELTO'), p)).toContain('el problema sigue');
    expect(explicarCierre('OBSERVADO', conIa(10, 'NO_CONCLUYENTE'), p)).toContain('no es concluyente');
  });

  // La regla está también en explicarCierre (decisión del 08/11): si una cambia y la otra no, falla acá.
  it('el texto siempre coincide con lo que decidió decidirCierre', () => {
    for (const distancia of [null, 0, 49.2, 50, 50.01, 120]) {
      for (const veredicto of ['RESUELTO', 'NO_RESUELTO', 'NO_CONCLUYENTE', null] as const) {
        // Como el servicio: a la IA solo se le pregunta si la foto es del lugar.
        const enElLugar = distancia !== null && distancia <= p.distanciaMaxM;
        const datos = enElLugar && veredicto ? conIa(distancia, veredicto) : sinIa(distancia);
        const resultado = decidirCierre(distancia, enElLugar ? veredicto : null, p);
        const texto = explicarCierre(resultado, datos, p);

        const esperado = {
          VALIDADO: /está resuelto/,
          RECHAZADO: /el máximo es|el problema sigue/,
          OBSERVADO: /otro operador lo confirme/,
        }[resultado];
        expect(texto, `${distancia} m, ${veredicto}`).toMatch(esperado);
      }
    }
  });
});
