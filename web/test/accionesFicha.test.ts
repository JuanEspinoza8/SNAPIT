import { describe, expect, it } from 'vitest';
import { accionesValidas, estaCaducado, motivoSinGestion } from '../src/funcionalidades/bandeja/acciones.js';
import type { EstadoIncidente } from '../src/funcionalidades/bandeja/tipos.js';

const AHORA = new Date('2026-10-27T12:00:00Z');

type Datos = Parameters<typeof accionesValidas>[0];

function ficha(estado: EstadoIncidente, cambios: Partial<Datos> = {}): Datos {
  return {
    estado,
    incidentePrincipalId: null,
    caducadoEn: null,
    vigenteHasta: null,
    prioridad: {
      puntajePrioridad: 50,
      prioridadManual: null,
      motivoPrioridadManual: null,
      ajustadaPor: null,
      factores: [],
    },
    ...cambios,
  };
}

const conAjuste = (estado: EstadoIncidente): Datos =>
  ficha(estado, {
    prioridad: { ...ficha(estado).prioridad, prioridadManual: 80, motivoPrioridadManual: 'Obra' },
  });

/** Los nombres de las acciones que se ofrecen, sin comentar (que siempre está). */
const ofrecidas = (datos: Datos, ahora = AHORA) =>
  Object.entries(accionesValidas(datos, ahora))
    .filter(([nombre, valida]) => valida && nombre !== 'comentar')
    .map(([nombre]) => nombre);

describe('acciones válidas según el estado del incidente', () => {
  it('en revisión: se puede desestimar y corregir la categoría, pero no derivar ni ajustar la prioridad', () => {
    expect(ofrecidas(ficha('REGISTRADO'))).toEqual(['desestimar', 'cambiarCategoria']);
  });

  it('verificado: se deriva, no se pasa a ejecución sin derivar antes', () => {
    expect(ofrecidas(ficha('VERIFICADO'))).toEqual([
      'derivar',
      'desestimar',
      'cambiarCategoria',
      'fijarPrioridad',
    ]);
  });

  it('derivado: se re-deriva o se pasa a ejecución', () => {
    expect(ofrecidas(ficha('DERIVADO'))).toEqual([
      'derivar',
      'pasarAEjecucion',
      'desestimar',
      'cambiarCategoria',
      'fijarPrioridad',
    ]);
  });

  it('en ejecución: no vuelve a derivarse; a resuelto se llega con el cierre, que no está en la ficha', () => {
    expect(ofrecidas(ficha('EN_EJECUCION'))).toEqual(['desestimar', 'cambiarCategoria', 'fijarPrioridad']);
  });

  it.each<EstadoIncidente>(['RESUELTO', 'DESESTIMADO'])('%s es final: solo se puede comentar', (estado) => {
    expect(ofrecidas(conAjuste(estado))).toEqual([]);
    expect(accionesValidas(ficha(estado), AHORA).comentar).toBe(true);
  });

  it('quitar el ajuste se ofrece solo si hay uno, aunque el incidente haya vuelto a en revisión', () => {
    expect(accionesValidas(ficha('VERIFICADO'), AHORA).quitarPrioridad).toBe(false);
    expect(accionesValidas(conAjuste('VERIFICADO'), AHORA).quitarPrioridad).toBe(true);
    expect(accionesValidas(conAjuste('REGISTRADO'), AHORA)).toMatchObject({
      quitarPrioridad: true,
      fijarPrioridad: false,
    });
  });
});

describe('incidentes que no se gestionan', () => {
  it('unido a otro: solo se comenta, se gestiona el principal', () => {
    const unido = { ...conAjuste('DERIVADO'), incidentePrincipalId: 9 };
    expect(ofrecidas(unido)).toEqual([]);
    expect(accionesValidas(unido, AHORA).comentar).toBe(true);
    expect(motivoSinGestion(unido, AHORA)).toBe('Está unido al incidente #9: se gestiona desde ese.');
  });

  it('caducado por la tarea diaria: no se ofrece nada más que comentar', () => {
    const caducado = ficha('VERIFICADO', { caducadoEn: '2026-10-20T03:10:00Z' });
    expect(ofrecidas(caducado)).toEqual([]);
    expect(motivoSinGestion(caducado, AHORA)).toBe('Caducó: ya no está vigente.');
  });

  it('temporal con la vigencia vencida cuenta como caducado aunque la tarea diaria no lo haya marcado', () => {
    const vencido = ficha('DERIVADO', { vigenteHasta: '2026-10-27T11:59:59Z' });
    expect(ofrecidas(vencido)).toEqual([]);
  });

  it('justo en el vencimiento ya caducó; un segundo antes, no', () => {
    const datos = { caducadoEn: null, vigenteHasta: AHORA.toISOString() };
    expect(estaCaducado(datos, AHORA)).toBe(true);
    expect(estaCaducado(datos, new Date(AHORA.getTime() - 1000))).toBe(false);
  });

  it('un incidente abierto no tiene motivo para no gestionarse', () => {
    expect(motivoSinGestion(ficha('DERIVADO', { vigenteHasta: '2026-11-30T00:00:00Z' }), AHORA)).toBeNull();
  });

  it.each<[EstadoIncidente, string]>([
    ['RESUELTO', 'Está resuelto.'],
    ['DESESTIMADO', 'Está desestimado.'],
  ])('%s explica por qué no hay acciones', (estado, texto) => {
    expect(motivoSinGestion(ficha(estado), AHORA)).toBe(texto);
  });
});
