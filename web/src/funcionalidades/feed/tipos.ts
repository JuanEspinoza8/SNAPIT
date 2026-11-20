import type { EstadoVisible } from '../mapa/tipos.js';

/** Formas que devuelve la API (docs/api.md, sección «Social»). */

export type Gravedad = 'LEVE' | 'MODERADA' | 'GRAVE';

export interface Foto {
  id: number;
  url: string;
}

/**
 * Quién reportó o comentó, sin nada que lo identifique: dentro de cada incidente es «Vecino N», numerado por
 * orden de llegada. SnapIt también comenta (al publicar un reporte y al resolverse el problema): va con su
 * nombre, sin número y con `sistema`.
 */
export interface Autor {
  numero: number | null;
  /** «Vecino 2» o «SnapIt». */
  nombre: string;
  sistema?: boolean;
}

/** Un reporte de un vecino: una publicación. */
export interface ReportePublico {
  id: number;
  incidenteId: number;
  descripcion: string | null;
  creadoEn: string;
  autor: Autor;
  fotos: Foto[];
  cantidadMeGusta: number;
  cantidadComentarios: number;
  /** Si quien consulta ya le dio me gusta. Sin sesión, false. */
  yaMeGusta?: boolean;
}

/** Una publicación del feed (`GET /api/social/feed`): un reporte publicado, con la línea a su incidente. */
export interface Publicacion extends ReportePublico {
  categoria: { id: number; nombre: string };
  /** La que declaró el vecino. */
  severidad: Gravedad;
  direccion: string | null;
  lat: number;
  lon: number;
  /** El área que atiende el problema. */
  derivadoA: { id: number; nombre: string } | null;
  incidente: {
    id: number;
    estado: EstadoVisible;
    resueltoEn: string | null;
    /** Cuántos vecinos reportaron el mismo problema. */
    cantidadVecinos: number;
  };
}

export interface PaginaPublicaciones {
  reportes: Publicacion[];
  /** El cursor de la página siguiente. Null: no hay más. */
  siguiente: string | null;
}

export interface Comentario {
  id: number;
  texto: string;
  creadoEn: string;
  editadoEn: string | null;
  autor: Autor;
  /** Si lo escribió quien consulta: puede editarlo o eliminarlo. */
  esMio?: boolean;
}
