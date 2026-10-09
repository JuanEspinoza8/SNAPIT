import type { DetalleError, ErrorApi } from './error.js';

// El 409 de correo repetido no trae `detalles`, pero es del campo del correo.
const campoDelCodigo: Record<string, string> = { EMAIL_EN_USO: 'email' };

export interface ErroresRepartidos<C extends string> {
  porCampo: Partial<Record<C, string>>;
  /** Si quedó algo que no cae en ningún campo y va en el aviso general. */
  sinCampo: boolean;
}

/** Reparte un error de la API entre los campos de un formulario. `campos`
 *  traduce el nombre que usa la API (`organismoId`) al del formulario. */
export function repartirErrores<C extends string>(
  error: ErrorApi,
  campos: Record<string, C>,
): ErroresRepartidos<C> {
  const detalles = detallesDe(error);
  const porCampo: Partial<Record<C, string>> = {};
  let sinCampo = detalles.length === 0;

  for (const detalle of detalles) {
    const campo = campos[detalle.campo];
    if (campo) porCampo[campo] ??= detalle.mensaje;
    else sinCampo = true;
  }

  return { porCampo, sinCampo };
}

function detallesDe(error: ErrorApi): DetalleError[] {
  if (error.detalles.length > 0) return error.detalles;
  const campo = campoDelCodigo[error.codigo];
  return campo ? [{ campo, mensaje: error.mensaje }] : [];
}
