/** Formas que devuelven GET /api/bandeja, GET /api/incidentes/:id/gestion y las acciones del operador (docs/api.md). */

import type { SenalVerificacion, Severidad, EstadoVerificacion } from '../revision/tipos.js';

export type EstadoIncidente =
  'REGISTRADO' | 'VERIFICADO' | 'DERIVADO' | 'EN_EJECUCION' | 'RESUELTO' | 'DESESTIMADO';

/** Los estados que trae la bandeja: lo que el organismo tiene que atender. */
export type EstadoBandeja = 'VERIFICADO' | 'DERIVADO' | 'EN_EJECUCION';

export interface Referencia {
  id: number;
  nombre: string;
}

/** Una parte del puntaje de prioridad, con su explicación en texto. */
export interface FactorPrioridad {
  factor: 'SEVERIDAD' | 'EVIDENCIAS' | 'ANTIGUEDAD' | 'CONTEXTO_URBANO' | 'AJUSTE_MANUAL';
  valor: number;
  detalle: string | null;
}

/** Un incidente de la bandeja, ya ordenado por el servidor. */
export interface IncidenteBandeja {
  id: number;
  estado: EstadoBandeja;
  categoria: Referencia;
  area: Referencia;
  direccion: string | null;
  cantidadReportes: number;
  primerReporteEn: string;
  puntajePrioridad: number;
  prioridadManual: number | null;
  motivos: FactorPrioridad[];
  /** Cómo quedó su último intento de cierre (F09), o null si no tiene. */
  cierre: 'OBSERVADO' | 'RECHAZADO' | null;
}

export interface FiltrosBandeja {
  /** Sin área, el servidor usa la del operador. `todas` pide todo el organismo. */
  areaId?: number | 'todas';
  estado?: EstadoBandeja;
  categoriaId?: number;
  /** Solo los que tienen un cierre esperando confirmación. */
  cierre?: 'OBSERVADO';
}

export interface Prioridad {
  puntajePrioridad: number;
  prioridadManual: number | null;
  motivoPrioridadManual: string | null;
  ajustadaPor: Referencia | null;
  factores: FactorPrioridad[];
}

export type TipoMovimiento =
  'CAMBIO_ESTADO' | 'DERIVACION' | 'FUSION' | 'SEPARACION' | 'AJUSTE_PRIORIDAD' | 'COMENTARIO';

/** Una fila de la bitácora. `usuario` es null si lo hizo el sistema. */
export interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  usuario: Referencia | null;
  area: Referencia | null;
  estadoAnterior: EstadoIncidente | null;
  estadoNuevo: EstadoIncidente | null;
  comentario: string | null;
  incidenteRelacionadoId: number | null;
  creadoEn: string;
}

export interface ReporteGestion {
  id: number;
  /** De qué incidente es: el de la ficha o uno de sus unidos. */
  incidenteId: number;
  registradoEn: string;
  /** La que eligió el vecino, que puede no ser la del incidente. */
  categoria: Referencia;
  severidadDeclarada: Severidad;
  descripcion: string | null;
  direccion: string | null;
  lat: number;
  lon: number;
  origen: 'SITIO_WEB' | 'APP_MOVIL';
  nivelConfianza: number;
  estadoVerificacion: EstadoVerificacion;
  senales: SenalVerificacion[];
  fotos: { id: number; url: string }[];
}

/** La ficha de gestión de un incidente, en cualquier estado. */
export interface FichaGestion {
  id: number;
  estado: EstadoIncidente;
  categoria: Referencia;
  area: Referencia;
  severidad: Severidad;
  direccion: string | null;
  lat: number;
  lon: number;
  tipoVigencia: 'PERMANENTE' | 'TEMPORAL';
  vigenteHasta: string | null;
  caducadoEn: string | null;
  primerReporteEn: string;
  resueltoEn: string | null;
  cantidadReportes: number;
  /** A qué incidente está unido, o null si no lo está. */
  incidentePrincipalId: number | null;
  unidos: { id: number; estado: EstadoIncidente }[];
  prioridad: Prioridad;
  reportes: ReporteGestion[];
  bitacora: Movimiento[];
  cierre: CierreGestion | null;
}

/**
 * El resultado de un intento de cierre (F09): VALIDADO resolvió el incidente, RECHAZADO deja volver a intentar y
 * OBSERVADO espera que otro operador lo confirme.
 */
export type ResultadoCierre = 'VALIDADO' | 'OBSERVADO' | 'RECHAZADO';

export interface CierreGestion {
  id: number;
  resultadoComparacion: ResultadoCierre | null;
  /** Null si la foto no traía GPS. */
  distanciaMetros: number | null;
  /** Por qué quedó así, en texto. */
  detalleComparacion: string | null;
  creadoEn: string;
  /** Quien hizo el último intento: no puede confirmarlo él mismo. */
  usuario: Referencia;
  /** Las fotos del después de cada intento, de la primera a la última. */
  fotos: { id: number; url: string }[];
}

/** Lo que responde POST /api/incidentes/:id/cierre. */
export interface RespuestaCierre {
  incidente: { id: number; estado: EstadoIncidente };
  cierre: Pick<CierreGestion, 'id' | 'distanciaMetros' | 'detalleComparacion' | 'fotos'> & {
    resultadoComparacion: ResultadoCierre;
  };
}

/** Lo que responde POST /api/incidentes/:id/cierre/confirmacion. */
export interface RespuestaConfirmacion {
  incidente: { id: number; estado: EstadoIncidente };
  cierre: { id: number; resultadoComparacion: 'VALIDADO' | 'RECHAZADO' };
  movimiento: Movimiento;
}
