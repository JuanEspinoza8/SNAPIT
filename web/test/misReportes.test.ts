import { describe, expect, it } from 'vitest';
import { estadoParaElVecino, tieneFicha } from '../src/funcionalidades/misReportes/tipos.js';
import type { ReporteMio } from '../src/funcionalidades/misReportes/tipos.js';

const reporte = (parcial: Partial<ReporteMio>): ReporteMio => ({
  id: 1,
  registradoEn: '2026-10-01T12:00:00.000Z',
  categoria: { id: 3, nombre: 'Cordón sin rampa' },
  severidadDeclarada: 'GRAVE',
  descripcion: null,
  fotos: [],
  estadoVerificacion: 'PENDIENTE_REVISION',
  incidente: null,
  ...parcial,
});

describe('estadoParaElVecino', () => {
  it('usa el estado del incidente cuando el reporte tiene uno', () => {
    const r = reporte({ incidente: { id: 1, estado: 'EN_EJECUCION', enRevision: false } });
    expect(estadoParaElVecino(r)).toBe('EN_EJECUCION');
  });

  it('el desestimado del reporte gana aunque el incidente siga', () => {
    const r = reporte({
      estadoVerificacion: 'DESESTIMADO',
      incidente: { id: 1, estado: 'REGISTRADO', enRevision: true },
    });
    expect(estadoParaElVecino(r)).toBe('DESESTIMADO');
  });

  it('sin incidente, un reporte verificado se muestra verificado', () => {
    expect(estadoParaElVecino(reporte({ estadoVerificacion: 'VERIFICADO' }))).toBe('VERIFICADO');
  });

  it('sin incidente y pendiente, se muestra en revisión', () => {
    expect(estadoParaElVecino(reporte({ estadoVerificacion: 'PENDIENTE_REVISION' }))).toBe('REGISTRADO');
  });
});

describe('tieneFicha', () => {
  it('la tiene si hay incidente vigente', () => {
    expect(tieneFicha(reporte({ incidente: { id: 1, estado: 'DERIVADO', enRevision: false } }))).toBe(true);
  });

  it('no la tiene si el incidente es desestimado', () => {
    expect(tieneFicha(reporte({ incidente: { id: 1, estado: 'DESESTIMADO', enRevision: false } }))).toBe(
      false,
    );
  });

  it('no la tiene si no hay incidente', () => {
    expect(tieneFicha(reporte({}))).toBe(false);
  });
});
