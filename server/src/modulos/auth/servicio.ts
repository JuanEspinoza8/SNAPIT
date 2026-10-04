import type { Usuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ErrorApp } from '../../compartido/errores.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import * as repositorio from './repositorio.js';
import {
  crearTokenAcceso,
  DIAS_TOKEN_RENOVACION,
  generarTokenAleatorio,
  hashToken,
  HORAS_TOKEN_VERIFICACION,
  sumarDias,
  sumarHoras,
} from './tokens.js';

const COSTO_BCRYPT = 10;

// Si el correo no existe se compara igual contra este hash, para que la respuesta tarde lo mismo
// y no se pueda averiguar qué correos están registrados midiendo el tiempo.
const HASH_DE_RELLENO = bcrypt.hashSync('clave-de-relleno', COSTO_BCRYPT);

const credencialesInvalidas = () =>
  new ErrorApp(401, 'CREDENCIALES_INVALIDAS', 'El correo o la clave no son correctos');

const tokenRenovacionInvalido = () =>
  new ErrorApp(401, 'TOKEN_RENOVACION_INVALIDO', 'La sesión venció o no es válida. Volvé a ingresar');

/** Los datos del usuario que se le devuelven al cliente. Nunca incluye el hash de la clave. */
export function usuarioPublico(usuario: Usuario) {
  const { id, email, nombre, rol, organismoId, areaId } = usuario;
  return { id, email, nombre, rol, organismoId, areaId };
}

async function abrirSesion(usuario: Usuario) {
  const tokenRenovacion = generarTokenAleatorio();
  await repositorio.crearSesion(
    usuario.id,
    hashToken(tokenRenovacion),
    sumarDias(new Date(), DIAS_TOKEN_RENOVACION),
  );
  return { tokenAcceso: crearTokenAcceso(usuario), tokenRenovacion, usuario: usuarioPublico(usuario) };
}

export async function registrar(datos: { email: string; clave: string; nombre: string }) {
  if (await repositorio.buscarUsuarioPorEmail(datos.email)) {
    throw new ErrorApp(409, 'EMAIL_EN_USO', 'Ya hay una cuenta con ese correo');
  }

  const tokenVerificacion = generarTokenAleatorio();
  try {
    const usuario = await repositorio.crearVecinoConVerificacion(
      {
        email: datos.email,
        nombre: datos.nombre,
        passwordHash: await bcrypt.hash(datos.clave, COSTO_BCRYPT),
      },
      { tokenHash: hashToken(tokenVerificacion), expiraEn: sumarHoras(new Date(), HORAS_TOKEN_VERIFICACION) },
    );

    // El envío del correo es la #7. Mientras tanto, en desarrollo el token se ve en la consola.
    if (env.NODE_ENV === 'development') {
      logger.info({ usuarioId: usuario.id, tokenVerificacion }, 'Token de verificación generado');
    }

    return { usuario: usuarioPublico(usuario) };
  } catch (error) {
    // Dos registros simultáneos con el mismo correo: la restricción única de la base frena al segundo.
    if ((error as { code?: string }).code === 'P2002') {
      throw new ErrorApp(409, 'EMAIL_EN_USO', 'Ya hay una cuenta con ese correo');
    }
    throw error;
  }
}

export async function ingresar(datos: { email: string; clave: string }) {
  const usuario = await repositorio.buscarUsuarioPorEmail(datos.email);
  const claveCorrecta = await bcrypt.compare(datos.clave, usuario?.passwordHash ?? HASH_DE_RELLENO);
  if (!usuario || !claveCorrecta) throw credencialesInvalidas();

  // El estado de la cuenta se revela recién con la clave correcta.
  if (usuario.eliminadoEn) {
    throw new ErrorApp(403, 'CUENTA_DADA_DE_BAJA', 'La cuenta fue dada de baja');
  }
  if (!usuario.emailVerificadoEn) {
    throw new ErrorApp(
      403,
      'CUENTA_SIN_CONFIRMAR',
      'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada y seguí el enlace que te enviamos',
    );
  }

  return abrirSesion(usuario);
}

export async function renovar(tokenRenovacion: string) {
  const sesion = await repositorio.buscarSesion(hashToken(tokenRenovacion));
  const ahora = new Date();
  if (!sesion || sesion.usadoEn || sesion.expiraEn <= ahora) throw tokenRenovacionInvalido();

  const { usuario } = sesion;
  if (usuario.eliminadoEn || !usuario.emailVerificadoEn) {
    await repositorio.consumirSesion(sesion.id, ahora);
    throw tokenRenovacionInvalido();
  }

  // Rotación: el token recibido se marca como usado y se emite uno nuevo, todo junto o nada.
  const nuevoToken = generarTokenAleatorio();
  await repositorio.transaccion(async (tx) => {
    if (!(await repositorio.consumirSesion(sesion.id, ahora, tx))) throw tokenRenovacionInvalido();
    await repositorio.crearSesion(
      usuario.id,
      hashToken(nuevoToken),
      sumarDias(ahora, DIAS_TOKEN_RENOVACION),
      tx,
    );
  });

  return {
    tokenAcceso: crearTokenAcceso(usuario),
    tokenRenovacion: nuevoToken,
    usuario: usuarioPublico(usuario),
  };
}

/** Cierra la sesión. Responde igual aunque el token no exista, para no dar pistas. */
export async function salir(tokenRenovacion: string) {
  await repositorio.cerrarSesionPorHash(hashToken(tokenRenovacion), new Date());
}

export async function obtenerUsuarioActual(id: number) {
  const usuario = await repositorio.buscarUsuarioPorId(id);
  if (!usuario || usuario.eliminadoEn) {
    throw new ErrorApp(401, 'TOKEN_INVALIDO', 'La sesión no es válida. Volvé a ingresar');
  }
  return { usuario: usuarioPublico(usuario) };
}
