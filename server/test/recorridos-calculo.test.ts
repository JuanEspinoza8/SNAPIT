import { describe, expect, it } from 'vitest';
import {
  claveRegla,
  costoDelTramo,
  leerEfecto,
  minutosCaminando,
  reglasDelTramo,
  type ReglasPerfil,
  type TramoParaCosto,
} from '../src/modulos/recorridos/calculo.js';

// Los umbrales de partida de la semilla.
const UMBRALES = { pendienteMaxPorcentaje: 8, anchoMinM: 0.9 };

/** Una vereda de 100 m sin nada que le estorbe a nadie. */
const vereda = (cambios: Partial<TramoParaCosto> = {}): TramoParaCosto => ({
  costoBase: 100,
  tipo: 'VEREDA',
  tieneRampa: true,
  pendientePorcentaje: null,
  anchoEstimado: null,
  superficie: null,
  extremoConSenal: false,
  incidentes: [],
  ...cambios,
});

// La fila de Silla de ruedas de «Atributos del tramo por perfil» (docs/calculos.md).
const SILLA: ReglasPerfil = {
  escalera: 'intransitable',
  sin_rampa: 3,
  pendiente: 3,
  sin_pavimentar: 2,
  angosto: 'intransitable',
  cruce_sin_senal: 1,
};

describe('qué reglas de atributos se activan en un tramo', () => {
  it('una vereda con rampa y sin datos de pendiente, ancho ni superficie no activa ninguna', () => {
    expect(reglasDelTramo(vereda(), UMBRALES)).toEqual([]);
  });

  it('una escalera activa la suya', () => {
    expect(reglasDelTramo(vereda({ tipo: 'ESCALERA' }), UMBRALES)).toEqual(['escalera']);
  });

  it('sin rampa activa la suya: false también es "nadie la relevó"', () => {
    expect(reglasDelTramo(vereda({ tieneRampa: false }), UMBRALES)).toEqual(['sin_rampa']);
  });

  it('la pendiente cuenta desde más del umbral, subiendo o bajando', () => {
    expect(reglasDelTramo(vereda({ pendientePorcentaje: 8 }), UMBRALES)).toEqual([]);
    expect(reglasDelTramo(vereda({ pendientePorcentaje: 8.01 }), UMBRALES)).toEqual(['pendiente']);
    expect(reglasDelTramo(vereda({ pendientePorcentaje: -9 }), UMBRALES)).toEqual(['pendiente']);
  });

  it('el ancho cuenta por debajo del umbral, no en el umbral', () => {
    expect(reglasDelTramo(vereda({ anchoEstimado: 0.9 }), UMBRALES)).toEqual([]);
    expect(reglasDelTramo(vereda({ anchoEstimado: 0.89 }), UMBRALES)).toEqual(['angosto']);
  });

  it('sin pavimentar son las superficies de tierra, ripio, pasto y parecidas de OSM', () => {
    for (const superficie of ['unpaved', 'dirt', 'gravel', 'grass', 'ground', 'sand']) {
      expect(reglasDelTramo(vereda({ superficie }), UMBRALES)).toEqual(['sin_pavimentar']);
    }
    for (const superficie of ['concrete', 'paving_stones', 'sett', 'paved', 'asphalt']) {
      expect(reglasDelTramo(vereda({ superficie }), UMBRALES)).toEqual([]);
    }
  });

  it('un cruce sin señal en sus extremos activa la suya; con semáforo sonoro o piso podotáctil, no', () => {
    expect(reglasDelTramo(vereda({ tipo: 'CRUCE' }), UMBRALES)).toEqual(['cruce_sin_senal']);
    expect(reglasDelTramo(vereda({ tipo: 'CRUCE', extremoConSenal: true }), UMBRALES)).toEqual([]);
  });

  it('una vereda sin señal en sus extremos no es un cruce: no activa la regla del cruce', () => {
    expect(reglasDelTramo(vereda({ extremoConSenal: false }), UMBRALES)).not.toContain('cruce_sin_senal');
  });

  it('un tramo puede activar varias a la vez', () => {
    const tramo = vereda({
      tieneRampa: false,
      pendientePorcentaje: 12,
      superficie: 'dirt',
      anchoEstimado: 0.6,
    });

    expect(reglasDelTramo(tramo, UMBRALES)).toEqual(['sin_rampa', 'pendiente', 'sin_pavimentar', 'angosto']);
  });
});

describe('costo de un tramo para un perfil', () => {
  it('sin reglas ni incidentes, es el costo base', () => {
    expect(costoDelTramo(vereda(), SILLA, UMBRALES)).toBe(100);
  });

  it('multiplica los factores de los atributos entre sí', () => {
    const tramo = vereda({ tieneRampa: false, superficie: 'dirt' });

    expect(costoDelTramo(tramo, SILLA, UMBRALES)).toBe(100 * 3 * 2);
  });

  it('multiplica también los factores de los incidentes vigentes', () => {
    const tramo = vereda({ tieneRampa: false, incidentes: [1.5, 2] });

    expect(costoDelTramo(tramo, SILLA, UMBRALES)).toBe(100 * 3 * 1.5 * 2);
  });

  it('un atributo intransitable para el perfil lo bloquea, aunque lo demás lo encarezca', () => {
    expect(costoDelTramo(vereda({ tipo: 'ESCALERA', tieneRampa: false }), SILLA, UMBRALES)).toBeNull();
    expect(costoDelTramo(vereda({ anchoEstimado: 0.5 }), SILLA, UMBRALES)).toBeNull();
  });

  it('un incidente intransitable para el perfil lo bloquea', () => {
    expect(costoDelTramo(vereda({ incidentes: [2, 'intransitable'] }), SILLA, UMBRALES)).toBeNull();
  });

  it('la misma escalera bloquea a un perfil y solo encarece a otro', () => {
    const escalera = vereda({ tipo: 'ESCALERA' });

    expect(costoDelTramo(escalera, SILLA, UMBRALES)).toBeNull();
    expect(costoDelTramo(escalera, { escalera: 2 }, UMBRALES)).toBe(200);
  });

  it('una regla que el perfil no tiene cargada no le cambia el costo (un perfil nuevo)', () => {
    const tramo = vereda({ tipo: 'ESCALERA', tieneRampa: false, superficie: 'dirt' });

    expect(costoDelTramo(tramo, {}, UMBRALES)).toBe(100);
  });

  it('un factor 1 no cambia nada: la regla del cruce no le pesa a la silla', () => {
    expect(costoDelTramo(vereda({ tipo: 'CRUCE' }), SILLA, UMBRALES)).toBe(100);
  });

  it('los umbrales salen de los parámetros', () => {
    const tramo = vereda({ pendientePorcentaje: 6 });

    expect(costoDelTramo(tramo, SILLA, UMBRALES)).toBe(100);
    expect(costoDelTramo(tramo, SILLA, { ...UMBRALES, pendienteMaxPorcentaje: 5 })).toBe(300);
  });
});

describe('valor de una regla en parametro_sistema', () => {
  it('acepta un factor mayor que 0 o "intransitable"', () => {
    expect(leerEfecto('intransitable')).toBe('intransitable');
    expect(leerEfecto(' 2.5 ')).toBe(2.5);
    expect(leerEfecto('1')).toBe(1);
    expect(leerEfecto('0.5')).toBe(0.5);
  });

  it('rechaza cero, negativos, vacíos y cualquier otro texto', () => {
    for (const valor of ['0', '-1', '', '  ', 'Intransitable', 'bloquea', 'Infinity', 'NaN', '2,5']) {
      expect(leerEfecto(valor)).toBeNull();
    }
  });

  it('la clave lleva la regla y el id del perfil', () => {
    expect(claveRegla('sin_rampa', 3)).toBe('ruteo.sin_rampa.perfil_3');
  });
});

describe('minutos caminando', () => {
  it('redondea hacia arriba', () => {
    expect(minutosCaminando(200, 50)).toBe(4);
    expect(minutosCaminando(201, 50)).toBe(5);
    expect(minutosCaminando(10, 50)).toBe(1);
  });

  it('sin distancia, cero', () => {
    expect(minutosCaminando(0, 50)).toBe(0);
  });
});
