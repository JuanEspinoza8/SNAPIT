import type { EstadoVisible } from '../mapa/tipos.js';

/** Formas que devuelve la API (docs/api.md, secciones «Mapa público» y «Social»). */

export type Gravedad = 'LEVE' | 'MODERADA' | 'GRAVE';

export interface Foto {
  id: number;
  url: string;
}

/** Una tarjeta del feed (`GET /api/incidentes/feed`). */
export interface TarjetaFeed {
  id: number;
  lat: number;
  lon: number;
  categoria: { id: number; nombre: string };
  estado: EstadoVisible;
  enRevision: boolean;
  severidad: Gravedad;
  primerReporteEn: string;
  cantidadReportes: number;
  cantidadVecinos: number;
  direccion: string | null;
  resueltoEn: string | null;
  fotos: Foto[];
  cantidadFotos: number;
  cantidadMeGusta: number;
  cantidadComentarios: number;
}

export interface PaginaFeed {
  incidentes: TarjetaFeed[];
  /** El cursor de la página siguiente. Null: no hay más. */
  siguiente: string | null;
}

export interface Autor {
  id: number;
  nombre: string;
}

/** Un reporte de un vecino, como se ve en el detalle del incidente. */
export interface ReportePublico {
  id: number;
  incidenteId: number;
  descripcion: string | null;
  creadoEn: string;
  autor: Autor;
  fotos: Foto[];
  cantidadMeGusta: number;
  cantidadComentarios: number;
}

export interface Comentario {
  id: number;
  texto: string;
  creadoEn: string;
  editadoEn: string | null;
  autor: Autor;
}
