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
  const [esquema, token] = req.headers.authorization?.split(' ') ?? [];
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

  req.usuario = resultado.usuario;
  next();
};

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
