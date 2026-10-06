export interface DetalleError {
  campo: string;
  mensaje: string;
}

export class ErrorApi extends Error {
  readonly codigo: string;
  readonly status?: number;
  readonly detalles: DetalleError[];

  constructor(mensaje: string, codigo: string, status?: number, detalles: DetalleError[] = []) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.status = status;
    this.detalles = detalles;
  }

  /** Alias en español del texto de `Error`. El resto del código usa
   *  nombres en español, como `codigo` y `detalles`. */
  get mensaje(): string {
    return this.message;
  }
}

const sinConexion = new ErrorApi(
  'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.',
  'SIN_CONEXION',
);

const inesperado = new ErrorApi(
  'Ocurrió un error inesperado. Intentá de nuevo en unos minutos.',
  'ERROR_INESPERADO',
);

/** Lee el error de una respuesta de la API. Si no viene con el formato
 *  esperado, lo registra y devuelve el mensaje genérico. */
export function leerError(status: number, cuerpo: unknown, requestId?: string | null): ErrorApi {
  if (esObjeto(cuerpo) && esObjeto(cuerpo.error)) {
    const { codigo, mensaje, detalles } = cuerpo.error;
    if (typeof codigo === 'string' && typeof mensaje === 'string') {
      return new ErrorApi(mensaje, codigo, status, leerDetalles(detalles));
    }
  }

  // 502/503/504 con un cuerpo que no es el de la API: el proxy (Vite en
  // desarrollo, nginx en la demo) no llegó al servidor. Es como no tener
  // conexión, no un error de la aplicación.
  if (status === 502 || status === 503 || status === 504) return sinConexion;

  console.error(
    `Respuesta sin el formato de error de la API: ${status}` +
      (requestId ? ` (X-Request-Id: ${requestId})` : ''),
    cuerpo,
  );
  return new ErrorApi(inesperado.message, inesperado.codigo, status);
}

/** Convierte cualquier excepción en un error con mensaje para mostrar. */
export function aErrorApi(error: unknown): ErrorApi {
  if (error instanceof ErrorApi) return error;
  // fetch rechaza con TypeError cuando no hay conexión o el servidor no responde.
  if (error instanceof TypeError) return sinConexion;
  console.error('Error inesperado', error);
  return inesperado;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function leerDetalles(valor: unknown): DetalleError[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item) =>
    esObjeto(item) && typeof item.campo === 'string' && typeof item.mensaje === 'string'
      ? [{ campo: item.campo, mensaje: item.mensaje }]
      : [],
  );
}
