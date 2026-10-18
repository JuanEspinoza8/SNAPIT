import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bitsDelHash,
  deCeroACien,
  leerParametrosNumericos,
  noNegativo,
  positivo,
} from '../src/compartido/parametros.js';
import { prisma } from '../src/compartido/prisma.js';

// Claves propias de cada corrida: ningún cálculo ni otro test las lee.
async function cargar(valores: Record<string, string>) {
  const prefijo = `prueba.${randomUUID()}`;
  await prisma.parametroSistema.createMany({
    data: Object.entries(valores).map(([nombre, valor]) => ({
      clave: `${prefijo}.${nombre}`,
      valor,
      tipo: 'decimal',
    })),
  });
  return (nombre: string) => `${prefijo}.${nombre}`;
}

describe('leerParametrosNumericos', () => {
  it('usa el valor de la base si cumple su regla, y el de partida si falta, no es un número o no la cumple', async () => {
    const clave = await cargar({ radio: '45', peso: '0', hamming: '-1', umbral: '101', texto: 'abc' });

    const leidos = await leerParametrosNumericos({
      radio: { clave: clave('radio'), valor: 30, valido: positivo },
      peso: { clave: clave('peso'), valor: 0.3, valido: noNegativo },
      hamming: { clave: clave('hamming'), valor: 6, valido: bitsDelHash },
      umbral: { clave: clave('umbral'), valor: 60, valido: deCeroACien },
      texto: { clave: clave('texto'), valor: 7 },
      falta: { clave: clave('falta'), valor: 9 },
    });

    expect(leidos).toEqual({ radio: 45, peso: 0, hamming: 6, umbral: 60, texto: 7, falta: 9 });
  });

  it('sin regla acepta cualquier número, también negativo', async () => {
    const clave = await cargar({ resta: '-40' });

    expect(await leerParametrosNumericos({ resta: { clave: clave('resta'), valor: -10 } })).toEqual({
      resta: -40,
    });
  });
});

describe('reglas de los parámetros', () => {
  it('cada una deja pasar solo lo que tiene sentido', () => {
    expect([positivo(1), positivo(0)]).toEqual([true, false]);
    expect([noNegativo(0), noNegativo(-0.1)]).toEqual([true, false]);
    expect([deCeroACien(0), deCeroACien(100), deCeroACien(100.5)]).toEqual([true, true, false]);
    expect([bitsDelHash(0), bitsDelHash(64), bitsDelHash(65), bitsDelHash(6.5)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
