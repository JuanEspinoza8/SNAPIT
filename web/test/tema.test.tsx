import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTema } from '../src/compartido/tema/tema.js';

afterEach(() => {
  delete document.documentElement.dataset.tema;
});

describe('tema', () => {
  it('arranca en oscuro si no se eligió otro', () => {
    const { result } = renderHook(() => useTema());

    expect(result.current.tema).toBe('oscuro');
  });

  it('alternar pasa al claro, lo aplica a la página y lo recuerda', () => {
    const { result } = renderHook(() => useTema());

    act(() => result.current.alternar());

    expect(result.current.tema).toBe('claro');
    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(localStorage.getItem('snapit.tema')).toBe('claro');

    act(() => result.current.alternar());
    expect(result.current.tema).toBe('oscuro');
  });

  it('respeta lo que dejó index.html al cargar', () => {
    document.documentElement.dataset.tema = 'claro';

    const { result } = renderHook(() => useTema());

    expect(result.current.tema).toBe('claro');
  });
});
