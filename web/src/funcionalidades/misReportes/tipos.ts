/** Formas que devuelve `GET /api/reportes/mios` (docs/api.md, sección Reportes). */

/** Qué pasó con este reporte. */
export type EstadoVerificacion = 'PENDIENTE_REVISION' | 'VERIFICADO' | 'DESESTIMADO';

/** Qué pasa con el problema. A diferencia del mapa, incluye el desestimado. */
export type EstadoIncidente =
  'REGISTRADO' | 'VERIFICADO' | 'DERIVADO' | 'EN_EJECUCION' | 'RESUELTO' | 'DESESTIMADO';

export interface ReporteMio {
  id: number;
  registradoEn: string;
  categoria: { id: number; nombre: string };
  severidadDeclarada: 'LEVE' | 'MODERADA' | 'GRAVE';
  descripcion: string | null;
  fotos: { id: number; url: string }[];
  estadoVerificacion: EstadoVerificacion;
  incidente: { id: number; estado: EstadoIncidente; enRevision: boolean } | null;
}

/**
 * El único estado que se muestra en la fila. Al vecino le importa qué pasa con el problema, así
 * que manda el estado del incidente, salvo que su reporte se haya desestimado: el problema puede
 * seguir (lo verificaron otros), pero su aporte no cuenta. Sin incidente, se usa la verificación.
 */
export function estadoParaElVecino(reporte: ReporteMio): EstadoIncidente {
  if (reporte.estadoVerificacion === 'DESESTIMADO') return 'DESESTIMADO';
  if (reporte.incidente) return reporte.incidente.estado;
  return reporte.estadoVerificacion === 'VERIFICADO' ? 'VERIFICADO' : 'REGISTRADO';
}

/** La ficha es la del mapa público: un incidente desestimado no la tiene. */
export function tieneFicha(reporte: ReporteMio): boolean {
  return reporte.incidente !== null && reporte.incidente.estado !== 'DESESTIMADO';
}
