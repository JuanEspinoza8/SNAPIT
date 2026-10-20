/** Formas que devuelven GET /api/reportes/pendientes y POST /api/reportes/:id/revision (docs/api.md). */

// La única decisión posible del operador: verificar o desestimar.
export type DecisionRevision = 'VERIFICADO' | 'DESESTIMADO';

export type Severidad = 'LEVE' | 'MODERADA' | 'GRAVE';

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
  severidadDeclarada: Severidad;
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
  /** Si la IA ya lo procesó y lo dejó para revisión: qué propuso y por qué. */
  propuestaIa: PropuestaIa | null;
}

export type EstadoVerificacion = 'PENDIENTE_REVISION' | 'VERIFICADO' | 'DESESTIMADO';

/** Un reporte del organismo en cualquier estado (GET /api/reportes). */
export interface ReporteDelOrganismo extends ReportePendiente {
  estadoVerificacion: EstadoVerificacion;
  /** Cuándo lo publicó la IA al procesar la cola, o null si no fue ella. */
  publicadoPorIaEn: string | null;
}

export interface PropuestaIa {
  categoriaId: number;
  severidad: Severidad;
  explicacion: string | null;
  creadoEn: string;
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

// --- Procesamiento de la cola con IA (POST /api/ia/procesar-cola y GET /api/ia/procesos) ---

export type EstadoEvento = 'EN_PROCESO' | 'CLASIFICADO' | 'PUBLICADO' | 'REVISION_MANUAL' | 'ERROR';

/** Un paso que dio la IA con un reporte (GET /api/ia/procesos/:id). */
export interface EventoCola {
  id: number;
  creadoEn: string;
  estado: EstadoEvento;
  detalle: string | null;
  reporte: {
    id: number;
    categoria: { id: number; nombre: string };
    severidadDeclarada: Severidad;
    foto: { id: number; url: string } | null;
    incidenteId: number | null;
  };
  propuesta: {
    registroIaId: number | null;
    categoriaId: number | null;
    severidad: Severidad | null;
    explicacion: string | null;
  } | null;
}

export interface ProcesoCola {
  id: string;
  enCurso: boolean;
  iniciadoEn: string;
  eventos: EventoCola[];
  resumen: {
    total: number;
    procesados: number;
    publicados: number;
    derivados: number;
    errores: number;
    tiempoMedioMs: number | null;
    costoUsd: number | null;
  };
}

export interface ProcesoReciente {
  id: string;
  iniciadoEn: string;
  reportes: number;
  publicados: number;
  derivados: number;
  errores: number;
  enCurso: boolean;
}
