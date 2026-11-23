import { describe, expect, it } from 'vitest';
import {
  hoy,
  momento,
  nombreDelPdf,
  partirContenido,
  periodo,
  periodoInicial,
  validarPeriodo,
} from '../src/funcionalidades/informes/formato.js';

describe('fechas del informe', () => {
  it('hoy es el día de Argentina aunque en UTC ya sea el siguiente', () => {
    expect(hoy(new Date('2026-11-24T01:30:00Z'))).toBe('2026-11-23');
  });

  it('el período inicial va del 1 del mes a hoy', () => {
    expect(periodoInicial(new Date('2026-11-23T15:00:00Z'))).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-23',
    });
  });

  it('el período y el momento se muestran como en el PDF', () => {
    expect(periodo({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe('del 01/10/2026 al 31/10/2026');
    expect(momento('2026-11-23T17:05:00.000Z')).toBe('23/11/2026, 14:05');
    expect(nombreDelPdf({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe(
      'informe-2026-10-01-al-2026-10-31.pdf',
    );
  });
});

describe('validarPeriodo', () => {
  it.each([
    ['', '2026-10-31', { desde: 'Elegí desde cuándo' }],
    ['2026-10-01', '', { hasta: 'Elegí hasta cuándo' }],
    ['2026-11-01', '2026-10-01', { hasta: 'No puede ser anterior a desde' }],
    ['2025-01-01', '2026-01-31', { hasta: 'El período no puede pasar de 366 días' }],
    ['1999-12-31', '2000-01-01', { desde: 'No puede ser anterior al 2000' }],
  ])('%s a %s', (desde, hasta, errores) => {
    expect(validarPeriodo(desde, hasta)).toEqual(errores);
  });

  it('un mes, un día o un año bisiesto completo valen', () => {
    expect(validarPeriodo('2026-10-01', '2026-10-31')).toEqual({});
    expect(validarPeriodo('2026-10-01', '2026-10-01')).toEqual({});
    expect(validarPeriodo('2028-01-01', '2028-12-31')).toEqual({});
  });
});

describe('partirContenido', () => {
  it('una sección por título, y cada renglón del orden de intervención es un párrafo', () => {
    const contenido =
      '## Estado general\n\nHay 3 abiertos.\n\n## Orden de intervención\n\n1. Incidente #8: uno.\n2. Incidente #7: otro.';

    expect(partirContenido(contenido)).toEqual([
      { titulo: 'Estado general', parrafos: ['Hay 3 abiertos.'] },
      { titulo: 'Orden de intervención', parrafos: ['1. Incidente #8: uno.', '2. Incidente #7: otro.'] },
    ]);
  });

  it('lo que viene antes del primer título va en una sección sin título', () => {
    expect(partirContenido('Introducción.\n\n## Demoras\n\nNinguna.')).toEqual([
      { titulo: null, parrafos: ['Introducción.'] },
      { titulo: 'Demoras', parrafos: ['Ninguna.'] },
    ]);
  });
});
