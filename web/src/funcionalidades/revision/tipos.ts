/** Formas que devuelven la revisión y la cola de verificación con IA (docs/api.md). */

import type { EstadoVerificacion } from '../../compartido/formato/verificacion.js';

// La única decisión posible del operador: verificar (publicar) o desestimar.
export type DecisionRevision = 'VERIFICADO' | 'DESESTIMADO';

export type Severidad = 'LEVE' | 'MODERADA' | 'GRAVE';

/** Un control automático del reporte (F04). El servidor ya manda el detalle en texto: la web lo muestra. */
export interface SenalVerificacion {
  tipo: string; // EXIF_COINCIDE, EXIF_AUSENTE, FECHA_ANTIGUA o HASH_DUPLICADO
  valor: number; // 1 se cumple, -1 no se cumple, 0 la foto no trae con qué comprobarlo
  detalle: string | null;
}

/** Lo que vio la IA la última vez que miró la foto. Sin categoría si no es un problema de la vía pública. */
export interface PropuestaIa {
  categoriaId: number | null;
  severidad: Severidad | null;
  explicacion: string | null;
  creadoEn: string;
}

// Un reporte pendiente (GET /api/reportes/pendientes y /desestimados-pendientes), tal cual lo manda el servidor.
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
  nivelConfianza: number;
  senales: SenalVerificacion[];
  fotos: { id: number; url: string }[];
  incidente: {
    id: number;
    estado: string;
    cantidadReportes: number;
    /** El incidente propio del reporte. Si es distinto de `id`, se unió al incidente `id` (F05). */
    propioId?: number | null;
  } | null;
  vecino: { reputacion: number; reportesConfirmados: number; reportesDesestimados: number };
  propuestaIa: PropuestaIa | null;
}

export type { EstadoVerificacion };

/** Un reporte del organismo en cualquier estado (GET /api/reportes). */
export interface ReporteDelOrganismo extends ReportePendiente {
  estadoVerificacion: EstadoVerificacion;
  /** Cuándo lo publicó la IA, o null si no fue ella. */
  publicadoPorIaEn: string | null;
  /** La IA lo marcó para desestimar y espera que un operador lo confirme. */
  marcadoParaDesestimar: boolean;
}

// Lo que responde el servidor después de decidir (POST /api/reportes/:id/revision).
export interface ResultadoRevision {
  id: number;
  estadoVerificacion: DecisionRevision;
  incidente: { id: number; estado: string } | null;
  vecino: { reputacion: number };
}

// POST /api/reportes/desestimados-pendientes/confirmacion.
export interface ResultadoConfirmacion {
  desestimados: number[];
  omitidos: { id: number; motivo: string }[];
}

// Para mostrar en pantalla: "GRAVE" no se lee bien, "Grave" sí.
export const severidadEnTexto: Record<Severidad, string> = {
  LEVE: 'Leve',
  MODERADA: 'Moderada',
  GRAVE: 'Grave',
};

// --- Procesamiento con IA (POST /api/ia/procesar-cola y GET /api/ia/procesos) ---

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
  /** Lo que respondió la IA: viene solo en los pasos CLASIFICADO. */
  propuesta: {
    registroIaId: number | null;
    esProblemaViaPublica: boolean | null;
    categoriaId: number | null;
    severidad: Severidad | null;
    mismoProblema: boolean | null;
    datosPersonales: boolean | null;
    explicacion: string | null;
  } | null;
}

export interface ResumenProceso {
  total: number;
  procesados: number;
  publicados: number;
  publicadosConSugerencia: number;
  derivados: number;
  desestimados: number;
  errores: number;
  tiempoMedioMs: number | null;
  costoUsd: number | null;
}

export interface ProcesoCola {
  id: string;
  enCurso: boolean;
  iniciadoEn: string;
  eventos: EventoCola[];
  resumen: ResumenProceso;
}

export interface ProcesoReciente {
  id: string;
  iniciadoEn: string;
  reportes: number;
  publicados: number;
  derivados: number;
  desestimados: number;
  errores: number;
  enCurso: boolean;
}
