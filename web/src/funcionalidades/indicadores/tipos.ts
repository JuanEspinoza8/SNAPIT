import type { EstadoVisible } from '../mapa/tipos.js';

/** Los filtros del panel: los mismos que aceptan GET /api/indicadores y /calor (docs/api.md). */
export interface FiltrosIndicadores {
  /** AAAA-MM-DD, en hora de Argentina. */
  desde: string;
  hasta: string;
  /** Null: todo el organismo. */
  areaId: number | null;
}

export type EstadoAbierto = Exclude<EstadoVisible, 'RESUELTO'>;

export interface TiempoDeResolucion {
  cantidad: number;
  medianaDias: number;
  promedioDias: number;
}

/** GET /api/indicadores. Cada indicador está explicado en docs/api.md. */
export interface Indicadores {
  abiertosPorEstado: { estado: EstadoAbierto; cantidad: number }[];
  /** `semana` es la fecha del lunes, AAAA-MM-DD. */
  nuevosYResueltosPorSemana: { semana: string; nuevos: number; resueltos: number }[];
  tiempoDeResolucion: {
    porCategoria: (TiempoDeResolucion & { id: number; nombre: string })[];
    porArea: (TiempoDeResolucion & { id: number; nombre: string })[];
    porBarrio: (TiempoDeResolucion & { barrio: string })[];
  };
  barriosConMasAbiertos: { barrio: string; cantidad: number }[];
  /** `porcentaje` es null si no hay reportes. */
  reportesDesestimados: { total: number; desestimados: number; porcentaje: number | null };
}

/** Un punto del mapa de calor: `peso` va de 0 a 1 según la prioridad. */
export interface PuntoCalor {
  lat: number;
  lon: number;
  peso: number;
}
