// Categorías, perfiles de movilidad, la matriz y los parámetros, como los devuelve la administración del
// servidor (#166 y #167, docs/api.md).

export type TipoVigencia = 'PERMANENTE' | 'TEMPORAL';

/** Una celda de la matriz: cuánto le estorba a un perfil un incidente de la categoría. */
export interface CeldaMatriz {
  perfilMovilidadId: number;
  nombre: string;
  activo: boolean;
  intransitable: boolean;
  factorPenalizacion: number;
}

export interface CategoriaAdmin {
  id: number;
  nombre: string;
  descripcion: string | null;
  area: { id: number; nombre: string; activa: boolean };
  tipoVigenciaDefault: TipoVigencia;
  diasCaducidadDefault: number | null;
  pesoSeveridadBase: number;
  activa: boolean;
  perfiles: CeldaMatriz[];
}

export interface DatosCategoria {
  nombre: string;
  descripcion: string | null;
  areaId: number;
  tipoVigenciaDefault: TipoVigencia;
  diasCaducidadDefault: number | null;
  pesoSeveridadBase: number;
  activa?: boolean;
}

export interface ReglaPerfil {
  regla: string;
  clave: string;
  /** Un número mayor que 0 o «intransitable». Null: la regla no le cambia el costo. */
  valor: string | null;
}

export interface PerfilAdmin {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  reglas: ReglaPerfil[];
}

export interface DatosPerfil {
  nombre: string;
  descripcion: string | null;
  activo?: boolean;
}

export interface Parametro {
  clave: string;
  valor: string;
  tipo: 'entero' | 'decimal' | 'factor' | string;
  descripcion: string | null;
}
