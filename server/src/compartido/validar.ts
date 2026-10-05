import { z } from 'zod';
import { type DetalleError, ErrorApp } from './errores.js';

// Los mensajes que no escribimos en cada esquema (por ejemplo, un cuerpo que no es un objeto) salen en castellano.
z.config(z.locales.es());

/** Valida la entrada con un esquema de zod. Si no cumple, responde 400 con un detalle por campo. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;

  // Un campo puede fallar más de una regla (un correo inválido y además largo): se informa solo la primera.
  const detalles: DetalleError[] = [];
  for (const problema of resultado.error.issues) {
    const campo = problema.path.join('.') || '(cuerpo)';
    if (!detalles.some((detalle) => detalle.campo === campo)) {
      detalles.push({ campo, mensaje: problema.message });
    }
  }
  throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', detalles);
}
