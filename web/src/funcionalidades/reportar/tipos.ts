export type Severidad = 'LEVE' | 'MODERADA' | 'GRAVE';

export interface DatosReporte {
  foto: File;
  categoriaId: number;
  severidad: Severidad;
  descripcion: string;
  lat: number;
  lon: number;
  /** Lo que propuso la IA para esta foto, tal cual: el servidor registra si el vecino lo aceptó. */
  sugerencia?: SugerenciaIa | null;
}

/** Respuesta de POST /api/ia/clasificar-foto. */
export interface SugerenciaIa {
  categoriaId: number;
  severidad: Severidad;
  registroIaId: number;
}

export interface ReporteEnviado {
  id: number;
  incidenteId: number | null;
  nivelConfianza: number;
  estadoVerificacion: 'VERIFICADO' | 'PENDIENTE_REVISION' | 'DESESTIMADO';
}
