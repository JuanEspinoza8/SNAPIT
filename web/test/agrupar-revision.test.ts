import { describe, expect, it } from 'vitest';
import { agruparPorReporte } from '../src/funcionalidades/revision/agrupar.js';
import type { EstadoEvento, EventoCola } from '../src/funcionalidades/revision/tipos.js';

let id = 0;
function evento(reporteId: number, estado: EstadoEvento, extra: Partial<EventoCola> = {}): EventoCola {
  id++;
  return {
    id,
    creadoEn: `2026-10-20T15:00:${String(id).padStart(2, '0')}.000Z`,
    estado,
    detalle: null,
    reporte: {
      id: reporteId,
      categoria: { id: 1, nombre: 'Pozo en la calzada' },
      severidadDeclarada: 'GRAVE',
      foto: null,
      incidenteId: 10,
    },
    propuesta: null,
    ...extra,
  };
}

describe('agruparPorReporte', () => {
  it('deja una fila por reporte, en el orden en que la IA los tomó, con su último estado', () => {
    const propuesta = {
      registroIaId: 7,
      categoriaId: 1,
      severidad: 'GRAVE' as const,
      explicacion: 'Se ve un pozo',
    };
    const eventos = [
      evento(18, 'EN_PROCESO'),
      evento(18, 'CLASIFICADO', { propuesta }),
      evento(18, 'PUBLICADO'),
      evento(19, 'EN_PROCESO'),
      evento(19, 'ERROR', { detalle: 'IA no disponible' }),
      evento(20, 'EN_PROCESO'),
    ];

    const filas = agruparPorReporte(eventos);

    expect(filas.map((fila) => [fila.reporte.id, fila.estado, fila.eventos.length])).toEqual([
      [18, 'PUBLICADO', 3],
      [19, 'ERROR', 2],
      [20, 'EN_PROCESO', 1],
    ]);
    // La propuesta del paso CLASIFICADO se conserva aunque después llegue otro paso.
    expect(filas[0]!.propuesta).toEqual(propuesta);
    expect(filas[0]!.ultimoEvento).toBe(eventos[2]!.creadoEn);
    expect(filas[1]!.propuesta).toBeNull();
  });

  it('sin eventos no hay filas', () => {
    expect(agruparPorReporte([])).toEqual([]);
  });
});
