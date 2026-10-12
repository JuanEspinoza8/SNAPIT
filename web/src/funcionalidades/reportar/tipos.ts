export type Severidad = 'LEVE' | 'MODERADA' | 'GRAVE';

export interface DatosReporte {
  foto: File;
  categoriaId: number;
  severidad: Severidad;
  descripcion: string;
  lat: number;
  lon: number;
}

export interface ReporteEnviado {
  id: number;
  incidenteId: number | null;
  nivelConfianza: number;
  estadoVerificacion: 'VERIFICADO' | 'PENDIENTE_REVISION' | 'DESESTIMADO';
}
