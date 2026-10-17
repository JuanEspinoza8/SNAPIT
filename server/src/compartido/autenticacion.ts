import type { RolUsuario } from '@prisma/client';
import type { RequestHandler } from 'express';
import { type UsuarioSesion, verificarTokenAcceso } from '../modulos/auth/tokens.js';
import { ErrorApp } from './errores.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Usuario de la sesión. Lo completa el middleware autenticar. */
      usuario?: UsuarioSesion;
    }
  }
}

/** Exige un tokenAcceso válido en el encabezado Authorization: Bearer <token>. */
export const autenticar: RequestHandler = (req, _res, next) => {
  req.usuario = usuarioDelEncabezado(req.headers.authorization);
  next();
};

/**
 * Para rutas públicas que muestran algo más con sesión. Sin el encabezado sigue sin usuario; si
 * viene, se valida igual que en autenticar: un token vencido da 401 para que el cliente renueve.
 */
export const sesionOpcional: RequestHandler = (req, _res, next) => {
  if (req.headers.authorization !== undefined) {
    req.usuario = usuarioDelEncabezado(req.headers.authorization);
  }
  next();
};

function usuarioDelEncabezado(encabezado: string | undefined): UsuarioSesion {
  const [esquema, token] = encabezado?.split(' ') ?? [];
  if (esquema !== 'Bearer' || !token) {
    throw new ErrorApp(401, 'NO_AUTENTICADO', 'Tenés que ingresar para continuar');
  }

  const resultado = verificarTokenAcceso(token);
  if (!resultado.valido) {
    // El cliente usa TOKEN_VENCIDO para saber que tiene que renovar.
    throw resultado.motivo === 'VENCIDO'
      ? new ErrorApp(401, 'TOKEN_VENCIDO', 'La sesión venció')
      : new ErrorApp(401, 'TOKEN_INVALIDO', 'La sesión no es válida. Volvé a ingresar');
  }
  return resultado.usuario;
}

/** Deja pasar solo a los roles indicados. Va siempre después de autenticar. */
export function permitirRoles(...roles: RolUsuario[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) throw new ErrorApp(401, 'NO_AUTENTICADO', 'Tenés que ingresar para continuar');
    if (!roles.includes(req.usuario.rol)) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'No tenés permiso para hacer esto');
    }
    next();
  };
}
