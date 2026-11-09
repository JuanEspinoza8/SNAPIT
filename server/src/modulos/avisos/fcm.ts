import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { RespuestaPush } from './calculo.js';

// La única puerta a Firebase Cloud Messaging: los tests la reemplazan con vi.mock.

export interface MensajePush {
  titulo: string;
  cuerpo: string;
  /** Lo que la app necesita al tocar el aviso (por ejemplo, qué ficha abrir). FCM solo acepta textos. */
  datos: Record<string, string>;
}

// undefined: todavía no se leyeron las credenciales. null: no hay, o no se pudieron leer.
let mensajeria: Messaging | null | undefined;

function obtenerMensajeria() {
  if (mensajeria !== undefined) return mensajeria;
  mensajeria = null;
  if (!env.FIREBASE_CREDENCIALES) {
    logger.warn('Falta FIREBASE_CREDENCIALES: los avisos se guardan, pero no salen al celular');
    return mensajeria;
  }
  try {
    const app = initializeApp({ credential: cert(env.FIREBASE_CREDENCIALES) }, 'snapit');
    mensajeria = getMessaging(app);
  } catch (error) {
    logger.error(
      { err: error, ruta: env.FIREBASE_CREDENCIALES },
      'No se pudieron leer las credenciales de Firebase: los avisos no salen al celular',
    );
  }
  return mensajeria;
}

/**
 * Manda el aviso a cada token y devuelve qué respondió FCM para cada uno, en el mismo orden.
 * Null si Firebase no está configurado. Si FCM no responde, lanza el error.
 */
export async function enviarPush(tokens: string[], mensaje: MensajePush): Promise<RespuestaPush[] | null> {
  const fcm = obtenerMensajeria();
  if (!fcm) return null;

  // tokens: el identificador que entrega firebase_messaging en la app.
  const respuesta = await fcm.sendEachForMulticast({
    tokens,
    notification: { title: mensaje.titulo, body: mensaje.cuerpo },
    data: mensaje.datos,
    android: { priority: 'high' },
  });
  return respuesta.responses.map((resultado, i) => ({
    token: tokens[i]!,
    aceptado: resultado.success,
    codigo: resultado.error?.code.replace(/^messaging\//, ''),
  }));
}
