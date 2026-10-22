import { describe, expect, it } from 'vitest';
import { costoUsd } from '../src/modulos/ia/costos.js';

describe('costoUsd', () => {
  it('calcula el costo con el precio del modelo', () => {
    // 1500 × 0,10 + 200 × 0,50 dólares por millón de tokens.
    expect(costoUsd('claude-haiku-5-5', { entrada: 1500, salida: 200 })).toBeCloseTo(0.00025, 10);
  });

  it('reconoce el modelo aunque la API lo devuelva con la fecha de la versión', () => {
    expect(costoUsd('claude-haiku-5-5-20261001', { entrada: 1500, salida: 200 })).toBe(
      costoUsd('claude-haiku-5-5', { entrada: 1500, salida: 200 }),
    );
  });

  it('sin el precio del modelo no inventa un costo', () => {
    expect(costoUsd('otro-modelo', { entrada: 1500, salida: 200 })).toBeNull();
    // Un prefijo parecido no alcanza: tiene que ser el modelo seguido de un guion.
    expect(costoUsd('claude-haiku-5-50', { entrada: 1500, salida: 200 })).toBeNull();
  });
});
