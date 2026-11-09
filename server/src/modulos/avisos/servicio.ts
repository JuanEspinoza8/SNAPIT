import type { TipoNotificacion } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { esquemaId } from '../incidentes/esquemas.js';
import { debeAvisar, resumirEnvio } from './calculo.js';
import { esquemaDispositivo } from './esquemas.js';
import { enviarPush } from './fcm.js';
import * as repositorio from './repositorio.js';

/**
 * Le avisa algo a un usuario (F10): guarda el aviso y lo manda a sus dispositivos activos. Cuándo se dispara
 * cada aviso lo decide #115.
 * - Con los avisos apagados (todos, o los de la categoría del incidente) o la cuenta dada de baja, no hace nada
 *   y devuelve null.
 * - Si FCM falla o no está configurado, el aviso queda guardado sin enviada_en: igual se ve en la lista.
 * - enviada_en se completa si FCM lo aceptó en al menos un dispositivo.
 * - Los dispositivos cuyo token FCM rechaza quedan inactivos.
 */
export async function notificar(
  usuarioId: number,
  tipo: TipoNotificacion,
  incidenteId: number | null,
  titulo: string,
  cuerpo: string,
) {
  const destinatario = await repositorio.buscarDestinatario(usuarioId, incidenteId);
  if (!destinatario || !debeAvisar(destinatario)) return null;

  const aviso = await repositorio.crearNotificacion({ usuarioId, tipo, incidenteId, titulo, cuerpo });
  const enviada = await enviar(aviso);
  return { id: aviso.id, enviada };
}

async function enviar(aviso: {
  id: number;
  usuarioId: number;
  tipo: TipoNotificacion;
  incidenteId: number | null;
  titulo: string;
  cuerpo: string;
}) {
  const tokens = (await repositorio.listarTokensActivos(aviso.usuarioId)).map((d) => d.tokenPush);
  if (tokens.length === 0) return false;

  const datos: Record<string, string> = { notificacionId: String(aviso.id), tipo: aviso.tipo };
  if (aviso.incidenteId !== null) datos.incidenteId = String(aviso.incidenteId);

  let respuestas;
  try {
    respuestas = await enviarPush(tokens, { titulo: aviso.titulo, cuerpo: aviso.cuerpo, datos });
  } catch (error) {
    logger.error(
      { err: error, notificacionId: aviso.id },
      'FCM no respondió: el aviso queda guardado sin enviar',
    );
    return false;
  }
  if (!respuestas) return false;

  const { aceptados, rechazados, otrasFallas } = resumirEnvio(respuestas);
  if (rechazados.length > 0) {
    await repositorio.desactivarDispositivos(aviso.usuarioId, rechazados);
    logger.info(
      { notificacionId: aviso.id, usuarioId: aviso.usuarioId, cantidad: rechazados.length },
      'FCM rechazó tokens: esos dispositivos quedan inactivos',
    );
  }
  if (otrasFallas.length > 0) {
    logger.warn(
      { notificacionId: aviso.id, codigos: otrasFallas.map((falla) => falla.codigo) },
      'FCM no pudo entregar el aviso en algunos dispositivos',
    );
  }
  if (aceptados === 0) return false;

  await repositorio.marcarEnviada(aviso.id, new Date());
  return true;
}

export async function registrarDispositivo(sesion: UsuarioSesion, cuerpo: unknown) {
  const { tokenPush, plataforma } = validar(esquemaDispositivo, cuerpo ?? {});
  await repositorio.registrarDispositivo(sesion.id, tokenPush, plataforma);
}

export async function listarNotificaciones(sesion: UsuarioSesion) {
  return { notificaciones: await repositorio.listarNotificaciones(sesion.id) };
}

export async function marcarLeida(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  // Un aviso de otro usuario responde igual que uno inexistente: no se revela que existe.
  if (!(await repositorio.marcarLeida(sesion.id, id, new Date()))) {
    throw new ErrorApp(404, 'NOTIFICACION_NO_ENCONTRADA', 'El aviso no existe');
  }
}
