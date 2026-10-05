import type { z } from 'zod';
import { ErrorApp } from './errores.js';

/** Valida la entrada con un esquema de zod. Si no cumple, responde 400 con un detalle por campo. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;

  const detalles = resultado.error.issues.map((problema) => ({
    campo: problema.path.join('.') || '(cuerpo)',
    mensaje: problema.message,
  }));
  throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', detalles);
}
