/** Lo que respondió FCM para un token. `codigo` es el error sin el prefijo "messaging/". */
export interface RespuestaPush {
  token: string;
  aceptado: boolean;
  codigo?: string;
}

/**
 * Los errores con los que FCM dice que el token ya no sirve: la app se desinstaló, el token venció o nunca fue
 * válido. No está invalid-argument: también aparece cuando el problema es el mensaje, y ahí se apagarían todos
 * los dispositivos de golpe.
 */
export const CODIGOS_TOKEN_RECHAZADO = [
  'registration-token-not-registered',
  'invalid-registration-token',
  'installation-id-not-registered',
];

export interface ResumenEnvio {
  aceptados: number;
  /** Tokens a dar de baja. */
  rechazados: string[];
  /** Fallas que no son del token (FCM caído, límite de envíos): el dispositivo sigue activo. */
  otrasFallas: { token: string; codigo: string }[];
}

export function resumirEnvio(respuestas: RespuestaPush[]): ResumenEnvio {
  const resumen: ResumenEnvio = { aceptados: 0, rechazados: [], otrasFallas: [] };
  for (const { token, aceptado, codigo = 'desconocido' } of respuestas) {
    if (aceptado) resumen.aceptados++;
    else if (CODIGOS_TOKEN_RECHAZADO.includes(codigo)) resumen.rechazados.push(token);
    else resumen.otrasFallas.push({ token, codigo });
  }
  return resumen;
}

export interface Destinatario {
  dadoDeBaja: boolean;
  /** El interruptor general (usuario.notificaciones_habilitadas). */
  avisosHabilitados: boolean;
  /** Su preferencia para la categoría del incidente. Sin fila en preferencia_notificacion, o sin incidente, true. */
  categoriaHabilitada: boolean;
}

/** Si el aviso se crea. Con los avisos apagados no se guarda ni se envía: tampoco aparece en la lista. */
export function debeAvisar(destinatario: Destinatario) {
  return !destinatario.dadoDeBaja && destinatario.avisosHabilitados && destinatario.categoriaHabilitada;
}
