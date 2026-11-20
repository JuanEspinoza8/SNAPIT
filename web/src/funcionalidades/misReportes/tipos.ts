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
  incidente: {
    id: number;
    estado: EstadoIncidente;
    enRevision: boolean;
    /** Cuándo caducó (#175), o null. Un incidente caducado ya no está en el mapa. */
    caducadoEn?: string | null;
  } | null;
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

/** Cuándo caducó el problema del reporte (F12), o null. Si se desestimó, se muestra eso y no la caducidad. */
export function caducoEl(reporte: ReporteMio): string | null {
  if (estadoParaElVecino(reporte) === 'DESESTIMADO') return null;
  return reporte.incidente?.caducadoEn ?? null;
}

/** La ficha es la del mapa público: un incidente desestimado o caducado no la tiene (da 404). */
export function tieneFicha(reporte: ReporteMio): boolean {
  return (
    reporte.incidente !== null && reporte.incidente.estado !== 'DESESTIMADO' && !reporte.incidente.caducadoEn
  );
}

/**
 * Si el reporte tiene su publicación (`/reporte/:id`), con el agradecimiento de SnapIt y los comentarios a su
 * foto: verificado y con su incidente a la vista, como lo pide `GET /api/social/reportes/:id`. Los eliminados no
 * llegan a la lista.
 */
export function estaPublicado(reporte: ReporteMio): boolean {
  return reporte.estadoVerificacion === 'VERIFICADO' && tieneFicha(reporte);
}
