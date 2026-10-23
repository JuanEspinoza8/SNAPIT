import { describe, expect, it } from 'vitest';
import { estadoDeFila } from '../src/funcionalidades/revision/estadoFila.js';
import type { EstadoEvento, EventoCola, ReportePendiente } from '../src/funcionalidades/revision/tipos.js';

const reporte: ReportePendiente = {
  id: 21,
  registradoEn: '2026-10-20T16:40:00.000Z',
  categoria: { id: 5, nombre: 'Obra que interrumpe el paso' },
  severidadDeclarada: 'MODERADA',
  descripcion: 'Cortaron la calle',
  direccion: 'Casilda 703, San Lorenzo Sur',
  lat: -38.95,
  lon: -68.06,
  origen: 'SITIO_WEB',
  nivelConfianza: 52,
  senales: [],
  fotos: [],
  incidente: { id: 30, estado: 'REGISTRADO', cantidadReportes: 1 },
  vecino: { reputacion: 50, reportesConfirmados: 0, reportesDesestimados: 0 },
  propuestaIa: null,
};

let id = 0;
const evento = (estado: EstadoEvento, extra: Partial<EventoCola> = {}): EventoCola => ({
  id: ++id,
  creadoEn: '2026-10-20T16:45:00.000Z',
  estado,
  detalle: `detalle de ${estado}`,
  reporte: {
    id: 21,
    categoria: reporte.categoria,
    severidadDeclarada: 'MODERADA',
    foto: null,
    incidenteId: 30,
  },
  propuesta: null,
  ...extra,
});

const propuesta = {
  registroIaId: 1,
  categoriaId: 5,
  severidad: 'MODERADA' as const,
  explicacion: 'Se ve una obra',
};
const contexto = { pendiente: true, eventos: [], decision: undefined, enCurso: false };

describe('estadoDeFila', () => {
  it('sin nada que lo cambie, está pendiente y se puede revisar', () => {
    expect(estadoDeFila(reporte, contexto)).toMatchObject({
      estado: 'PENDIENTE',
      resuelta: false,
      revisable: true,
    });
  });

  it('mientras la IA lo procesa no se puede revisar a mano', () => {
    const fila = estadoDeFila(reporte, {
      ...contexto,
      eventos: [evento('EN_PROCESO'), evento('CLASIFICADO', { propuesta })],
      enCurso: true,
    });

    expect(fila).toMatchObject({ estado: 'CLASIFICADO', revisable: false, resuelta: false });
    expect(fila.propuesta).toMatchObject({ categoriaId: 5, explicacion: 'Se ve una obra' });
  });

  it('publicado por la IA queda resuelto aunque el servidor ya no lo tenga pendiente', () => {
    const fila = estadoDeFila(reporte, {
      ...contexto,
      pendiente: false,
      eventos: [evento('EN_PROCESO'), evento('CLASIFICADO', { propuesta }), evento('PUBLICADO')],
    });

    expect(fila).toMatchObject({ estado: 'PUBLICADO_IA', resuelta: true, incidenteId: 30 });
  });

  it('derivado a revisión manual sigue pendiente, con el motivo y la propuesta', () => {
    const fila = estadoDeFila(reporte, {
      ...contexto,
      eventos: [evento('EN_PROCESO'), evento('CLASIFICADO', { propuesta }), evento('REVISION_MANUAL')],
    });

    expect(fila).toMatchObject({
      estado: 'REVISION_MANUAL',
      revisable: true,
      detalle: 'detalle de REVISION_MANUAL',
    });
  });

  it('una decisión manual tomada acá gana sobre todo lo demás', () => {
    const fila = estadoDeFila(reporte, {
      ...contexto,
      pendiente: false,
      eventos: [evento('REVISION_MANUAL')],
      decision: 'DESESTIMADO',
    });

    expect(fila).toMatchObject({ estado: 'DESESTIMADO', resuelta: true, revisable: false });
  });

  it('si dejó de estar pendiente por otro lado, queda como resuelto', () => {
    expect(estadoDeFila(reporte, { ...contexto, pendiente: false })).toMatchObject({
      estado: 'RESUELTO',
      resuelta: true,
    });
  });

  it('sin procesamiento en esta pantalla, usa la propuesta que trae el servidor', () => {
    const conPropuesta = {
      ...reporte,
      propuestaIa: { categoriaId: 2, severidad: 'LEVE' as const, explicacion: 'x', creadoEn: '' },
    };

    expect(estadoDeFila(conPropuesta, contexto).propuesta).toMatchObject({
      categoriaId: 2,
      severidad: 'LEVE',
    });
  });
});
