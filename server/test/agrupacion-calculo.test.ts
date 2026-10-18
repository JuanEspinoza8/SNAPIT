import { describe, expect, it } from 'vitest';
import {
  type Candidato,
  elegirIncidente,
  type ParametrosAgrupacion,
  puntajeAgrupacion,
  severidadConsolidada,
  similitudFoto,
} from '../src/modulos/agrupacion/calculo.js';

// Los valores de partida de la semilla (docs/calculos.md).
const parametros: ParametrosAgrupacion = {
  radioM: 30,
  ventanaDias: 30,
  pesoDistancia: 0.5,
  pesoTiempo: 0.2,
  pesoFoto: 0.3,
  umbral: 0.5,
};

const ahora = new Date('2026-10-18T12:00:00Z');
const reporte = { categoriaId: 1, registradoEn: ahora };
const diasAntes = (dias: number) => new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);

/** Un candidato que puntúa 1: mismo lugar, mismo momento, misma foto. */
const candidato = (cambios: Partial<Candidato> = {}): Candidato => ({
  incidenteId: 10,
  categoriaId: 1,
  estado: 'REGISTRADO',
  incidentePrincipalId: null,
  caducadoEn: null,
  vigenteHasta: null,
  distanciaM: 0,
  ultimoReporteEn: ahora,
  hamming: 0,
  ...cambios,
});

describe('puntajeAgrupacion', () => {
  it('mismo lugar, mismo momento y foto idéntica da el puntaje máximo, 1', () => {
    expect(puntajeAgrupacion(reporte, candidato(), parametros, ahora)).toBeCloseTo(1);
  });

  it('justo en el límite del radio todavía es candidato, con la parte de distancia en 0', () => {
    const puntaje = puntajeAgrupacion(reporte, candidato({ distanciaM: 30 }), parametros, ahora);

    expect(puntaje).toBeCloseTo(0.2 + 0.3);
  });

  it('un centímetro más allá del radio ya no es candidato', () => {
    expect(puntajeAgrupacion(reporte, candidato({ distanciaM: 30.01 }), parametros, ahora)).toBeNull();
  });

  it('con el último reporte justo al borde de la ventana, la parte de tiempo vale 0', () => {
    const puntaje = puntajeAgrupacion(
      reporte,
      candidato({ ultimoReporteEn: diasAntes(30) }),
      parametros,
      ahora,
    );

    expect(puntaje).toBeCloseTo(0.5 + 0.3);
  });

  it('fuera de la ventana de tiempo no es candidato', () => {
    expect(
      puntajeAgrupacion(reporte, candidato({ ultimoReporteEn: diasAntes(30.5) }), parametros, ahora),
    ).toBeNull();
  });

  it('un reporte cargado sin señal, anterior al último del incidente, cuenta como simultáneo', () => {
    const tardio = { categoriaId: 1, registradoEn: diasAntes(2) };

    expect(puntajeAgrupacion(tardio, candidato(), parametros, ahora)).toBeCloseTo(1);
  });

  it('otra categoría no es candidato', () => {
    expect(puntajeAgrupacion(reporte, candidato({ categoriaId: 2 }), parametros, ahora)).toBeNull();
  });

  it.each(['RESUELTO', 'DESESTIMADO'] as const)('un incidente %s no es candidato', (estado) => {
    expect(puntajeAgrupacion(reporte, candidato({ estado }), parametros, ahora)).toBeNull();
  });

  it('un incidente en curso (derivado o en ejecución) sí es candidato', () => {
    expect(
      puntajeAgrupacion(reporte, candidato({ estado: 'EN_EJECUCION' }), parametros, ahora),
    ).not.toBeNull();
  });

  it('un incidente unido a otro no es candidato', () => {
    expect(puntajeAgrupacion(reporte, candidato({ incidentePrincipalId: 5 }), parametros, ahora)).toBeNull();
  });

  it('un incidente caducado o con la vigencia vencida no es candidato', () => {
    expect(puntajeAgrupacion(reporte, candidato({ caducadoEn: diasAntes(1) }), parametros, ahora)).toBeNull();
    expect(
      puntajeAgrupacion(reporte, candidato({ vigenteHasta: diasAntes(1) }), parametros, ahora),
    ).toBeNull();
  });

  it('foto idéntica suma todo el peso de la foto; sin hash, nada', () => {
    const lejos = { distanciaM: 30, ultimoReporteEn: diasAntes(30) };

    expect(puntajeAgrupacion(reporte, candidato({ ...lejos, hamming: 0 }), parametros, ahora)).toBeCloseTo(
      0.3,
    );
    expect(puntajeAgrupacion(reporte, candidato({ ...lejos, hamming: null }), parametros, ahora)).toBe(0);
  });
});

describe('similitudFoto', () => {
  it('va de 1 (la misma) a 0 desde los 32 bits distintos', () => {
    expect(similitudFoto(0)).toBe(1);
    expect(similitudFoto(16)).toBe(0.5);
    expect(similitudFoto(32)).toBe(0);
    expect(similitudFoto(50)).toBe(0);
    expect(similitudFoto(null)).toBe(0);
  });
});

describe('elegirIncidente', () => {
  it('elige el de mayor puntaje entre los que superan el umbral', () => {
    const elegido = elegirIncidente(
      reporte,
      [candidato({ incidenteId: 1, distanciaM: 20 }), candidato({ incidenteId: 2, distanciaM: 5 })],
      parametros,
      ahora,
    );

    expect(elegido?.incidenteId).toBe(2);
  });

  it('si ninguno alcanza el umbral, devuelve null y se crea un incidente nuevo', () => {
    // 15 m, hace 15 días, otra foto: 0,25 + 0,1 + 0 = 0,35
    const flojo = candidato({ distanciaM: 15, ultimoReporteEn: diasAntes(15), hamming: 40 });

    expect(elegirIncidente(reporte, [flojo], parametros, ahora)).toBeNull();
    expect(elegirIncidente(reporte, [], parametros, ahora)).toBeNull();
  });

  it('ignora a los que no son candidatos aunque estén más cerca', () => {
    const elegido = elegirIncidente(
      reporte,
      [candidato({ incidenteId: 1, estado: 'RESUELTO' }), candidato({ incidenteId: 2, distanciaM: 10 })],
      parametros,
      ahora,
    );

    expect(elegido?.incidenteId).toBe(2);
  });
});

describe('severidadConsolidada', () => {
  it('es la más declarada', () => {
    expect(severidadConsolidada(['LEVE', 'LEVE', 'GRAVE'])).toBe('LEVE');
    expect(severidadConsolidada(['MODERADA'])).toBe('MODERADA');
  });

  it('ante un empate, la más alta', () => {
    expect(severidadConsolidada(['LEVE', 'GRAVE'])).toBe('GRAVE');
    expect(severidadConsolidada(['MODERADA', 'LEVE', 'LEVE', 'MODERADA'])).toBe('MODERADA');
  });
});
