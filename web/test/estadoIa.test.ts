import { describe, expect, it } from 'vitest';
import { controles, resultadoIa } from '../src/funcionalidades/revision/estadoIa.js';
import type { EventoCola } from '../src/funcionalidades/revision/tipos.js';

const paso = (estado: EventoCola['estado'], extra: Partial<EventoCola> = {}): EventoCola => ({
  id: 1,
  creadoEn: '2026-10-20T16:00:00.000Z',
  estado,
  detalle: null,
  reporte: {
    id: 12,
    categoria: { id: 3, nombre: 'Cordón sin rampa' },
    severidadDeclarada: 'MODERADA',
    foto: null,
    incidenteId: 9,
  },
  propuesta: null,
  ...extra,
});

const vio = (esProblemaViaPublica: boolean): EventoCola['propuesta'] => ({
  registroIaId: 1,
  esProblemaViaPublica,
  categoriaId: null,
  severidad: null,
  mismoProblema: null,
  datosPersonales: false,
  explicacion: 'Es un perro.',
});

describe('resultadoIa', () => {
  it('sin pasos: en cola si el procesamiento sigue y la IA nunca lo miró; si no, nada', () => {
    expect(resultadoIa([], { enCurso: true, yaAnalizado: false })?.estado).toBe('EN_COLA');
    expect(resultadoIa([], { enCurso: true, yaAnalizado: true })).toBeNull();
    expect(resultadoIa([], { enCurso: false, yaAnalizado: false })).toBeNull();
  });

  it('mientras la IA lo mira, está analizando', () => {
    expect(resultadoIa([paso('EN_PROCESO')], { enCurso: true, yaAnalizado: false })?.estado).toBe(
      'ANALIZANDO',
    );
  });

  it('una revisión manual en la que la foto no es de la vía pública es un «desestimar»', () => {
    const eventos = [
      paso('CLASIFICADO', { propuesta: vio(false) }),
      paso('REVISION_MANUAL', { detalle: 'Motivo' }),
    ];

    expect(resultadoIa(eventos, { enCurso: false, yaAnalizado: true })).toEqual({
      estado: 'DESESTIMAR',
      motivo: 'Motivo',
      explicacion: 'Es un perro.',
    });
  });

  it('las demás revisiones manuales son «revisar», y lo publicado y los errores, lo que dicen', () => {
    const conAnalisis = (final: EventoCola) => [paso('CLASIFICADO', { propuesta: vio(true) }), final];
    const de = (final: EventoCola) =>
      resultadoIa(conAnalisis(final), { enCurso: false, yaAnalizado: true })?.estado;

    expect(de(paso('REVISION_MANUAL'))).toBe('REVISAR');
    expect(de(paso('PUBLICADO'))).toBe('PUBLICADO');
    expect(resultadoIa([paso('ERROR')], { enCurso: false, yaAnalizado: false })?.estado).toBe('ERROR');
  });
});

describe('controles', () => {
  it('devuelve los tres controles en orden, con su resultado según el valor de la señal', () => {
    const resultado = controles([
      { tipo: 'HASH_DUPLICADO', valor: -1, detalle: 'Repetida' },
      { tipo: 'EXIF_AUSENTE', valor: 0, detalle: 'Sin ubicación' },
      { tipo: 'FECHA_ANTIGUA', valor: 1, detalle: 'Reciente' },
    ]);

    expect(resultado).toEqual([
      { nombre: 'Ubicación de la foto', resultado: 'SIN_DATO', detalle: 'Sin ubicación' },
      { nombre: 'Antigüedad', resultado: 'BIEN', detalle: 'Reciente' },
      { nombre: 'Foto repetida', resultado: 'MAL', detalle: 'Repetida' },
    ]);
  });

  it('un reporte viejo sin las señales de los controles los muestra sin dato', () => {
    expect(controles([{ tipo: 'REPUTACION', valor: 0, detalle: null }]).map((c) => c.resultado)).toEqual([
      'SIN_DATO',
      'SIN_DATO',
      'SIN_DATO',
    ]);
  });
});
