import type { Usuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { type Correo, enviarCorreo } from '../../compartido/correo.js';
import { ErrorApp } from '../../compartido/errores.js';
import { logger } from '../../config/logger.js';
import { correoConfirmacion, correoRecuperacion } from './correos.js';
import * as repositorio from './repositorio.js';
import {
  crearTokenAcceso,
  DIAS_TOKEN_RENOVACION,
  estadoToken,
  generarTokenAleatorio,
  hashToken,
  HORAS_TOKEN_RECUPERACION,
  HORAS_TOKEN_VERIFICACION,
  sumarDias,
  sumarHoras,
} from './tokens.js';

export const COSTO_BCRYPT = 10;

// Si el correo no existe se compara igual contra este hash, para que la respuesta tarde lo mismo
// y no se pueda averiguar qué correos están registrados midiendo el tiempo.
const HASH_DE_RELLENO = bcrypt.hashSync('clave-de-relleno', COSTO_BCRYPT);

const credencialesInvalidas = () =>
  new ErrorApp(401, 'CREDENCIALES_INVALIDAS', 'El correo o la clave no son correctos');

const tokenRenovacionInvalido = () =>
  new ErrorApp(401, 'TOKEN_RENOVACION_INVALIDO', 'La sesión venció o no es válida. Volvé a ingresar');

type TipoEnlace = 'VERIFICACION_EMAIL' | 'RECUPERACION_CLAVE';

const MENSAJES_ENLACE: Record<TipoEnlace, Record<'USADO' | 'VENCIDO', string>> = {
  VERIFICACION_EMAIL: {
    USADO: 'Este enlace ya se usó. Si ya confirmaste tu correo, podés ingresar',
    VENCIDO:
      'El enlace venció. Pedí uno nuevo con «Olvidé mi clave»: al elegir una clave nueva también se confirma tu correo',
  },
  RECUPERACION_CLAVE: {
    USADO: 'Este enlace ya se usó. Si necesitás cambiar la clave otra vez, pedí uno nuevo',
    VENCIDO: 'El enlace venció. Pedí uno nuevo con «Olvidé mi clave»',
  },
};

const errorEnlace = (estado: 'USADO' | 'VENCIDO', tipo: TipoEnlace) =>
  new ErrorApp(400, `ENLACE_${estado}`, MENSAJES_ENLACE[tipo][estado]);

/** Manda el correo sin demorar la respuesta. Si falla, queda en el log como error. */
function enviarSinEsperar(correo: Correo, usuarioId: number) {
  enviarCorreo(correo).catch((error: unknown) => {
    logger.error({ err: error, usuarioId }, `No se pudo enviar el correo "${correo.asunto}"`);
  });
}

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

    // Si el correo no llega, el vecino puede usar «Olvidé mi clave», que también confirma el correo.
    enviarSinEsperar(correoConfirmacion(usuario, tokenVerificacion), usuario.id);

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
  const sesion = await repositorio.buscarToken(hashToken(tokenRenovacion), 'SESION');
  const ahora = new Date();
  if (!sesion || sesion.usadoEn || sesion.expiraEn <= ahora) throw tokenRenovacionInvalido();

  const { usuario } = sesion;
  if (usuario.eliminadoEn || !usuario.emailVerificadoEn) {
    await repositorio.consumirToken(sesion.id, ahora);
    throw tokenRenovacionInvalido();
  }

  // Rotación: el token recibido se marca como usado y se emite uno nuevo, todo junto o nada.
  const nuevoToken = generarTokenAleatorio();
  await repositorio.transaccion(async (tx) => {
    if (!(await repositorio.consumirToken(sesion.id, ahora, tx))) throw tokenRenovacionInvalido();
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

/** Busca el token de un link y controla que se pueda usar. Todavía no lo marca como usado. */
async function buscarEnlace(token: string, tipo: TipoEnlace, ahora: Date) {
  const enlace = await repositorio.buscarToken(hashToken(token), tipo);
  // Una cuenta dada de baja no confirma ni cambia la clave: su link se trata como inexistente.
  if (!enlace || enlace.usuario.eliminadoEn) {
    throw new ErrorApp(400, 'ENLACE_INVALIDO', 'El enlace no es válido. Revisá que esté completo');
  }
  const estado = estadoToken(enlace, ahora);
  if (estado !== 'VALIDO') throw errorEnlace(estado, tipo);
  return enlace;
}

export async function confirmarCorreo(token: string) {
  const ahora = new Date();
  const enlace = await buscarEnlace(token, 'VERIFICACION_EMAIL', ahora);

  await repositorio.transaccion(async (tx) => {
    if (!(await repositorio.consumirToken(enlace.id, ahora, tx))) {
      throw errorEnlace('USADO', 'VERIFICACION_EMAIL');
    }
    await repositorio.marcarCorreoConfirmado(enlace.usuarioId, ahora, tx);
  });
}

/**
 * La ruta no espera esta función: responde 204 enseguida, exista o no el correo. Si esperara la búsqueda
 * y el envío, un correo registrado tardaría más en responder y midiendo el tiempo se sabría quién tiene cuenta.
 */
export async function recuperarClave(email: string) {
  try {
    const usuario = await repositorio.buscarUsuarioPorEmail(email);
    if (!usuario || usuario.eliminadoEn) return;

    const token = generarTokenAleatorio();
    await repositorio.crearRecuperacionClave(
      usuario.id,
      hashToken(token),
      sumarHoras(new Date(), HORAS_TOKEN_RECUPERACION),
    );
    await enviarCorreo(correoRecuperacion(usuario, token));
  } catch (error) {
    // Nadie espera esta promesa: si se rechazara sin este catch, Node cortaría el proceso.
    logger.error({ err: error }, 'No se pudo enviar el correo para recuperar la clave');
  }
}

export async function restablecerClave(datos: { token: string; clave: string }) {
  const ahora = new Date();
  const enlace = await buscarEnlace(datos.token, 'RECUPERACION_CLAVE', ahora);
  const passwordHash = await bcrypt.hash(datos.clave, COSTO_BCRYPT);

  await repositorio.transaccion(async (tx) => {
    if (!(await repositorio.consumirToken(enlace.id, ahora, tx))) {
      throw errorEnlace('USADO', 'RECUPERACION_CLAVE');
    }
    await repositorio.cambiarClave(enlace.usuarioId, passwordHash, ahora, tx);
    // Cierra las sesiones abiertas, por si alguien entró con la clave vieja, y anula los otros links.
    await repositorio.anularTokensPendientes(enlace.usuarioId, ahora, tx);
    // El link llegó a ese correo, así que usarlo prueba que el correo es suyo. Es la salida para
    // quien no recibió el correo de confirmación o lo dejó vencer.
    await repositorio.marcarCorreoConfirmado(enlace.usuarioId, ahora, tx);
  });
}
