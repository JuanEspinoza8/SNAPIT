import { createHash, randomBytes } from 'node:crypto';
import type { RolUsuario } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const DURACION_TOKEN_ACCESO = '15m';
export const DIAS_TOKEN_RENOVACION = 30;
export const HORAS_TOKEN_VERIFICACION = 24;
export const HORAS_TOKEN_RECUPERACION = 1;

/** Lo que viaja dentro del tokenAcceso y queda disponible en req.usuario. */
export interface UsuarioSesion {
  id: number;
  rol: RolUsuario;
  organismoId: number | null;
  areaId: number | null;
}

export function crearTokenAcceso(usuario: UsuarioSesion): string {
  const { id, rol, organismoId, areaId } = usuario;
  return jwt.sign({ rol, organismoId, areaId }, env.JWT_SECRET, {
    subject: String(id),
    expiresIn: DURACION_TOKEN_ACCESO,
    algorithm: 'HS256',
  });
}

export type ResultadoVerificacion =
  { valido: true; usuario: UsuarioSesion } | { valido: false; motivo: 'VENCIDO' | 'INVALIDO' };

export function verificarTokenAcceso(token: string): ResultadoVerificacion {
  try {
    // Se fija el algoritmo para que nadie pueda mandar un token con "alg: none" u otro esquema.
    const datos = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof datos === 'string') return { valido: false, motivo: 'INVALIDO' };
    return {
      valido: true,
      usuario: {
        id: Number(datos.sub),
        rol: datos.rol,
        organismoId: datos.organismoId ?? null,
        areaId: datos.areaId ?? null,
      },
    };
  } catch (error) {
    return { valido: false, motivo: error instanceof jwt.TokenExpiredError ? 'VENCIDO' : 'INVALIDO' };
  }
}

export type EstadoToken = 'VALIDO' | 'USADO' | 'VENCIDO';

/** Un token de token_acceso sirve una sola vez y deja de servir justo en expiraEn. */
export function estadoToken(token: { usadoEn: Date | null; expiraEn: Date }, ahora: Date): EstadoToken {
  if (token.usadoEn) return 'USADO';
  if (token.expiraEn <= ahora) return 'VENCIDO';
  return 'VALIDO';
}

/** Valor aleatorio para los tokens de renovación, verificación y recuperación. Solo lo recibe el usuario. */
export function generarTokenAleatorio(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * En la base se guarda el SHA-256 del token, no el token. Alcanza con SHA-256 (y no bcrypt) porque el
 * valor ya es aleatorio de 256 bits, y así se puede buscar por igualdad en la columna única token_hash.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 24 * 60 * 60 * 1000);
}

export function sumarHoras(fecha: Date, horas: number): Date {
  return new Date(fecha.getTime() + horas * 60 * 60 * 1000);
}
