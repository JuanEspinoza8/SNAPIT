/** Formas que devuelve la API (docs/api.md, sección Mapa público). */

export type EstadoVisible = 'REGISTRADO' | 'VERIFICADO' | 'DERIVADO' | 'EN_EJECUCION' | 'RESUELTO';

export interface PuntoMapa {
  id: number;
  lat: number;
  lon: number;
  categoriaId: number;
  estado: EstadoVisible;
  enRevision: boolean;
  primerReporteEn: string;
  cantidadReportes: number;
}

export interface FichaIncidente {
  id: number;
  lat: number;
  lon: number;
  categoria: { id: number; nombre: string };
  estado: EstadoVisible;
  enRevision: boolean;
  primerReporteEn: string;
  cantidadReportes: number;
  cantidadVecinos: number;
  direccion: string | null;
  fotos: { id: number; url: string }[];
}

export interface Categoria {
  id: number;
  nombre: string;
}

export interface FiltrosMapa {
  categoriaId?: number;
  estado?: EstadoVisible;
  desde?: string;
  hasta?: string;
}

/** El rectángulo visible del mapa, en grados. */
export interface Rectangulo {
  oeste: number;
  sur: number;
  este: number;
  norte: number;
}
