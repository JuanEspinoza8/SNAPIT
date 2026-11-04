import { describe, expect, it } from 'vitest';
import { decidirCierre, type ParametrosCierre } from '../src/modulos/cierre/calculo.js';

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
