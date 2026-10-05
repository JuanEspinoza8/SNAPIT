import { describe, expect, it } from 'vitest';
import { estadoToken } from '../src/modulos/auth/tokens.js';

const ahora = new Date('2026-10-05T12:00:00Z');
const antes = new Date(ahora.getTime() - 1);
const despues = new Date(ahora.getTime() + 1);

describe('estadoToken', () => {
  it('sin usar y antes del vencimiento, es válido', () => {
    expect(estadoToken({ usadoEn: null, expiraEn: despues }, ahora)).toBe('VALIDO');
  });

  it('justo en el momento del vencimiento ya está vencido', () => {
    expect(estadoToken({ usadoEn: null, expiraEn: ahora }, ahora)).toBe('VENCIDO');
  });

  it('usado, aunque no haya vencido', () => {
    expect(estadoToken({ usadoEn: antes, expiraEn: despues }, ahora)).toBe('USADO');
  });

  it('usado y vencido se informa como usado', () => {
    expect(estadoToken({ usadoEn: antes, expiraEn: antes }, ahora)).toBe('USADO');
  });
});
