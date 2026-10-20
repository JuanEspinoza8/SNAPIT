/** Formas que devuelven GET /api/reportes/pendientes y POST /api/reportes/:id/revision (docs/api.md). */

// La única decisión posible del operador: verificar o desestimar.
export type DecisionRevision = 'VERIFICADO' | 'DESESTIMADO';

// Por qué el reporte quedó con ese nivel. El servidor ya manda el detalle
// explicado en texto: la web solo lo tiene que mostrar.
export interface SenalVerificacion {
  tipo: string; // EXIF_AUSENTE, HASH_DUPLICADO, REPUTACION, etc.
  valor: number; // cuánto sumó o restó (+20, -40, 0...)
  detalle: string | null; // la explicación en texto claro (puede faltar)
}

// Un reporte de la lista de pendientes, tal cual lo devuelve el servidor.
export interface ReportePendiente {
  id: number;
  registradoEn: string;
  categoria: { id: number; nombre: string };
  severidadDeclarada: 'LEVE' | 'MODERADA' | 'GRAVE';
  descripcion: string | null;
  direccion: string | null;
  lat: number;
  lon: number;
  origen: 'SITIO_WEB' | 'APP_MOVIL';
  nivelConfianza: number; // de 0 a 100
  senales: SenalVerificacion[];
  fotos: { id: number; url: string }[];
  incidente: { id: number; estado: string; cantidadReportes: number } | null;
  vecino: { reputacion: number; reportesConfirmados: number; reportesDesestimados: number };
}

// Lo que responde el servidor después de decidir (POST /api/reportes/:id/revision).
export interface ResultadoRevision {
  id: number;
  estadoVerificacion: DecisionRevision;
  incidente: { id: number; estado: string } | null;
  vecino: { reputacion: number };
}

// Para mostrar en pantalla: "GRAVE" no se lee bien, "Grave" sí.
export const severidadEnTexto: Record<ReportePendiente['severidadDeclarada'], string> = {
  LEVE: 'Leve',
  MODERADA: 'Moderada',
  GRAVE: 'Grave',
};

export const origenEnTexto: Record<ReportePendiente['origen'], string> = {
  SITIO_WEB: 'Sitio web',
  APP_MOVIL: 'App móvil',
};
