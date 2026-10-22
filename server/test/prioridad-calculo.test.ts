import { describe, expect, it } from 'vitest';
import {
  calcularPrioridad,
  type DatosPrioridad,
  MAXIMO_COLUMNA,
  type ParametrosPrioridad,
  type PuntoCercano,
} from '../src/modulos/prioridad/calculo.js';

// Los valores de partida de la semilla (docs/calculos.md).
const parametros: ParametrosPrioridad = {
  pesoSeveridad: 40,
  pesoEvidencias: 25,
  topeEvidencias: 15,
  pesoAntiguedad: 20,
  topeAntiguedadDias: 60,
  pesoContexto: 15,
  radioContextoM: 150,
  factorEscuela: 1,
  factorCentroSalud: 1,
  factorParada: 0.6,
  factorEdificioPublico: 0.5,
};

const ahora = new Date('2026-10-22T12:00:00Z');
const diasAntes = (dias: number) => new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);

/** Un pozo moderado recién reportado por un vecino, sin nada cerca: 40 + 6,25 + 0 + 0. */
const datos = (cambios: Partial<DatosPrioridad> = {}): DatosPrioridad => ({
  severidad: 'MODERADA',
  categoria: { nombre: 'Pozo en la calzada', pesoSeveridadBase: 1.5 },
  cantidadReportes: 1,
  confirmaciones: 0,
  primerReporteEn: ahora,
  puntosCercanos: [],
  ajusteManual: null,
  ...cambios,
});

const calcular = (cambios: Partial<DatosPrioridad> = {}, otros: Partial<ParametrosPrioridad> = {}) =>
  calcularPrioridad(datos(cambios), { ...parametros, ...otros }, ahora);

const factor = (resultado: ReturnType<typeof calcularPrioridad>, tipo: string) =>
  resultado.factores.find((f) => f.factor === tipo);

const escuela: PuntoCercano = { tipo: 'ESCUELA', nombre: 'Escuela N° 123', distanciaM: 80 };

describe('calcularPrioridad', () => {
  it('el ejemplo de docs/calculos.md: un pozo grave, cinco vecinos, diez días y una escuela a 80 m', () => {
    const resultado = calcular({
      severidad: 'GRAVE',
      cantidadReportes: 3,
      confirmaciones: 2,
      primerReporteEn: diasAntes(10),
      puntosCercanos: [escuela],
    });

    expect(resultado).toEqual({
      puntaje: 94.49,
      factores: [
        {
          factor: 'SEVERIDAD',
          valor: 60,
          detalle: 'Gravedad grave en Pozo en la calzada, una categoría que pesa ×1,5: +60',
        },
        {
          factor: 'EVIDENCIAS',
          valor: 16.16,
          detalle: 'Lo reportaron 3 veces y lo confirmaron 2 vecinos: +16,2',
        },
        { factor: 'ANTIGUEDAD', valor: 3.33, detalle: 'Lleva 10 días sin resolverse: +3,3' },
        { factor: 'CONTEXTO_URBANO', valor: 15, detalle: 'A 80 m de Escuela N° 123 (escuela): +15' },
      ],
    });
  });

  it('el puntaje es la suma de los cuatro factores, y sin ajuste manual no hay AJUSTE_MANUAL', () => {
    const resultado = calcular();

    expect(resultado.factores.map((f) => f.factor)).toEqual([
      'SEVERIDAD',
      'EVIDENCIAS',
      'ANTIGUEDAD',
      'CONTEXTO_URBANO',
    ]);
    expect(resultado.puntaje).toBe(46.25);
  });
});

describe('severidad', () => {
  it('leve, moderada y grave valen un tercio, dos tercios y todo el peso, por el de la categoría', () => {
    expect(factor(calcular({ severidad: 'LEVE' }), 'SEVERIDAD')?.valor).toBe(20);
    expect(factor(calcular({ severidad: 'MODERADA' }), 'SEVERIDAD')?.valor).toBe(40);
    expect(factor(calcular({ severidad: 'GRAVE' }), 'SEVERIDAD')?.valor).toBe(60);
  });

  it('muestra el peso de la categoría con sus decimales', () => {
    const resultado = calcular({
      severidad: 'LEVE',
      categoria: { nombre: 'Vereda rota', pesoSeveridadBase: 1.25 },
    });

    expect(factor(resultado, 'SEVERIDAD')).toEqual({
      factor: 'SEVERIDAD',
      valor: 16.67,
      detalle: 'Gravedad leve en Vereda rota, una categoría que pesa ×1,25: +16,7',
    });
  });
});

describe('evidencias', () => {
  it('un solo reporte suma un cuarto del peso (ln 2 / ln 16)', () => {
    expect(factor(calcular(), 'EVIDENCIAS')).toEqual({
      factor: 'EVIDENCIAS',
      valor: 6.25,
      detalle: 'Lo reportaron 1 vez: +6,3',
    });
  });

  it('suma las confirmaciones aunque no haya reportes válidos', () => {
    expect(factor(calcular({ cantidadReportes: 0, confirmaciones: 1 }), 'EVIDENCIAS')?.detalle).toBe(
      'Lo confirmó 1 vecino: +6,3',
    );
  });

  it('sin reportes ni confirmaciones no suma', () => {
    expect(factor(calcular({ cantidadReportes: 0 }), 'EVIDENCIAS')).toEqual({
      factor: 'EVIDENCIAS',
      valor: 0,
      detalle: 'Sin reportes válidos ni confirmaciones: +0',
    });
  });

  it('desde el tope suma todo el peso y no crece más', () => {
    const enElTope = factor(calcular({ cantidadReportes: 10, confirmaciones: 5 }), 'EVIDENCIAS');
    const pasado = factor(calcular({ cantidadReportes: 30, confirmaciones: 10 }), 'EVIDENCIAS');

    expect(enElTope).toEqual({
      factor: 'EVIDENCIAS',
      valor: 25,
      detalle: 'Lo reportaron 10 veces y lo confirmaron 5 vecinos (con 15 o más ya suma el máximo): +25',
    });
    expect(pasado?.valor).toBe(25);
  });
});

describe('antigüedad', () => {
  it('cuenta días completos: diez días y medio son diez', () => {
    expect(factor(calcular({ primerReporteEn: diasAntes(10.5) }), 'ANTIGUEDAD')).toEqual({
      factor: 'ANTIGUEDAD',
      valor: 3.33,
      detalle: 'Lleva 10 días sin resolverse: +3,3',
    });
  });

  it('con menos de un día no suma', () => {
    expect(factor(calcular({ primerReporteEn: diasAntes(0.9) }), 'ANTIGUEDAD')?.detalle).toBe(
      'Lleva menos de un día sin resolverse: +0',
    );
  });

  it('dice «1 día» en singular', () => {
    expect(factor(calcular({ primerReporteEn: diasAntes(1) }), 'ANTIGUEDAD')?.detalle).toBe(
      'Lleva 1 día sin resolverse: +0,3',
    );
  });

  it('una antigüedad mayor al tope suma lo mismo que el tope', () => {
    expect(factor(calcular({ primerReporteEn: diasAntes(75) }), 'ANTIGUEDAD')).toEqual({
      factor: 'ANTIGUEDAD',
      valor: 20,
      detalle: 'Lleva 75 días sin resolverse (con 60 o más ya suma el máximo): +20',
    });
  });

  it('un primer reporte con fecha futura cuenta como cero días, no resta', () => {
    expect(factor(calcular({ primerReporteEn: diasAntes(-0.5) }), 'ANTIGUEDAD')?.valor).toBe(0);
  });
});

describe('contexto urbano', () => {
  it('sin puntos de interés cerca no suma, y lo dice', () => {
    expect(factor(calcular(), 'CONTEXTO_URBANO')).toEqual({
      factor: 'CONTEXTO_URBANO',
      valor: 0,
      detalle: 'Sin escuelas, centros de salud, paradas ni edificios públicos a menos de 150 m: +0',
    });
  });

  it('con dos puntos de distinto tipo suma el de mayor factor, aunque esté más lejos', () => {
    const parada: PuntoCercano = { tipo: 'PARADA_TRANSPORTE', nombre: 'N-2935', distanciaM: 20 };

    expect(factor(calcular({ puntosCercanos: [parada, escuela] }), 'CONTEXTO_URBANO')).toEqual({
      factor: 'CONTEXTO_URBANO',
      valor: 15,
      detalle: 'A 80 m de Escuela N° 123 (escuela): +15',
    });
  });

  it('no suma los puntos: diez paradas valen lo mismo que una', () => {
    const paradas = Array.from({ length: 10 }, (_, i) => ({
      tipo: 'PARADA_TRANSPORTE' as const,
      nombre: `N-${i}`,
      distanciaM: 30 + i,
    }));

    expect(factor(calcular({ puntosCercanos: paradas }), 'CONTEXTO_URBANO')?.valor).toBe(9);
  });

  it('ante el mismo factor gana el más cercano', () => {
    const salud: PuntoCercano = { tipo: 'CENTRO_SALUD', nombre: 'Hospital Castro Rendón', distanciaM: 50 };

    expect(factor(calcular({ puntosCercanos: [escuela, salud] }), 'CONTEXTO_URBANO')?.detalle).toBe(
      'A 50 m de Hospital Castro Rendón (centro de salud): +15',
    );
  });

  it('un punto más allá del radio no cuenta', () => {
    const lejos = { ...escuela, distanciaM: 150.5 };

    expect(factor(calcular({ puntosCercanos: [lejos] }), 'CONTEXTO_URBANO')?.valor).toBe(0);
  });

  it('una parada con su código se entiende por el tipo, y un lugar sin nombre se nombra por su tipo', () => {
    const conCodigo: PuntoCercano = { tipo: 'PARADA_TRANSPORTE', nombre: 'N-2935', distanciaM: 40.4 };
    const sinNombre: PuntoCercano = {
      tipo: 'EDIFICIO_PUBLICO',
      nombre: 'Edificio público',
      distanciaM: 99.6,
    };

    expect(factor(calcular({ puntosCercanos: [conCodigo] }), 'CONTEXTO_URBANO')?.detalle).toBe(
      'A 40 m de N-2935 (parada de colectivo): +9',
    );
    expect(factor(calcular({ puntosCercanos: [sinNombre] }), 'CONTEXTO_URBANO')?.detalle).toBe(
      'A 100 m de un edificio público: +7,5',
    );
  });
});

describe('ajuste manual', () => {
  const ajuste = { valor: 50, motivo: 'obra programada', autor: 'Juan Pérez' };

  it('agrega la diferencia con lo calculado, pero el puntaje sigue siendo el calculado', () => {
    const resultado = calcular({ ajusteManual: ajuste });

    expect(resultado.puntaje).toBe(46.25);
    expect(resultado.factores).toHaveLength(5);
    expect(factor(resultado, 'AJUSTE_MANUAL')).toEqual({
      factor: 'AJUSTE_MANUAL',
      valor: 3.75,
      detalle: 'Ajuste manual de Juan Pérez (obra programada): +3,8',
    });
  });

  it('puede bajar la prioridad, y sin autor (usuario dado de baja) no lo nombra', () => {
    const resultado = calcular({ ajusteManual: { ...ajuste, valor: 10, autor: null } });

    expect(factor(resultado, 'AJUSTE_MANUAL')).toEqual({
      factor: 'AJUSTE_MANUAL',
      valor: -36.25,
      detalle: 'Ajuste manual (obra programada): −36,3',
    });
  });
});

describe('máximo de la columna (numeric(6,2), 9999,99)', () => {
  it('un factor que lo superaría se recorta, y el puntaje también', () => {
    const resultado = calcular(
      { severidad: 'GRAVE', categoria: { nombre: 'Pozo en la calzada', pesoSeveridadBase: 99.99 } },
      { pesoSeveridad: 1000 },
    );

    expect(factor(resultado, 'SEVERIDAD')?.valor).toBe(MAXIMO_COLUMNA);
    expect(resultado.puntaje).toBe(MAXIMO_COLUMNA);
  });

  it('una suma que lo superaría se recorta aunque cada factor entre', () => {
    const resultado = calcular(
      {
        severidad: 'GRAVE',
        categoria: { nombre: 'Pozo en la calzada', pesoSeveridadBase: 1 },
        cantidadReportes: 15,
      },
      { pesoSeveridad: 6000, pesoEvidencias: 6000 },
    );

    expect(resultado.factores.map((f) => f.valor)).toEqual([6000, 6000, 0, 0]);
    expect(resultado.puntaje).toBe(MAXIMO_COLUMNA);
  });
});
