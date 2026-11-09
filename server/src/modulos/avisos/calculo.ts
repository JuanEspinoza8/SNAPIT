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

// --- Quién se entera de qué (#115) ---

export type EstadoAvisado =
  'REGISTRADO' | 'VERIFICADO' | 'DERIVADO' | 'EN_EJECUCION' | 'RESUELTO' | 'DESESTIMADO';

/** Los estados como los lee el vecino, igual que en el mapa. */
export const ESTADOS_EN_TEXTO: Record<EstadoAvisado, string> = {
  REGISTRADO: 'en revisión',
  VERIFICADO: 'verificado',
  DERIVADO: 'derivado al área que lo resuelve',
  EN_EJECUCION: 'en ejecución',
  RESUELTO: 'resuelto',
  DESESTIMADO: 'desestimado',
};

export interface DestinatarioCambio {
  usuarioId: number;
  tipo: 'CAMBIO_ESTADO' | 'CIERRE';
}

/**
 * A quién se le avisa un cambio de estado del incidente (F10):
 * - A quienes lo reportaron y a quienes lo siguen, también en los incidentes unidos a él.
 * - Si quedó RESUELTO, quienes lo reportaron reciben el aviso de CIERRE en lugar del de cambio de estado.
 * - Cada uno una sola vez, aunque haya reportado varias veces y además lo siga.
 * - Quien hizo el cambio no se avisa a sí mismo, ni quien ya recibió otro aviso por el mismo hecho (`yaAvisados`:
 *   por ejemplo, el autor del reporte cuya revisión cambió el estado, que recibe el de verificación).
 */
export function destinatariosDelCambio(datos: {
  reportaron: number[];
  siguen: number[];
  actorId: number | null;
  nuevo: EstadoAvisado;
  yaAvisados?: number[];
}): DestinatarioCambio[] {
  const { reportaron, siguen, actorId, nuevo, yaAvisados = [] } = datos;
  const reportantes = new Set(reportaron);
  const resultado = new Map<number, DestinatarioCambio['tipo']>();
  for (const usuarioId of reportantes) {
    resultado.set(usuarioId, nuevo === 'RESUELTO' ? 'CIERRE' : 'CAMBIO_ESTADO');
  }
  for (const usuarioId of siguen) if (!resultado.has(usuarioId)) resultado.set(usuarioId, 'CAMBIO_ESTADO');
  if (actorId !== null) resultado.delete(actorId);
  for (const usuarioId of yaAvisados) resultado.delete(usuarioId);
  return [...resultado].map(([usuarioId, tipo]) => ({ usuarioId, tipo }));
}

/** El problema en pocas palabras: «Pozo en la calzada en Lanín 120, Villa Ceferino». */
export function queYDonde(categoria: string, direccion: string | null) {
  return direccion ? `«${categoria}» en ${direccion}` : `«${categoria}»`;
}

export function textoCambioEstado(tipo: DestinatarioCambio['tipo'], problema: string, nuevo: EstadoAvisado) {
  if (tipo === 'CIERRE') {
    return {
      titulo: 'Se resolvió un problema que reportaste',
      cuerpo: `${problema} quedó resuelto. Mirá el antes y el después en su ficha.`,
    };
  }
  return {
    titulo: 'Cambió el estado de un incidente',
    cuerpo: `${problema} pasó a ${ESTADOS_EN_TEXTO[nuevo]}.`,
  };
}

export function textoVerificacion(decision: 'VERIFICADO' | 'DESESTIMADO' | 'PENDIENTE', categoria: string) {
  if (decision === 'PENDIENTE') {
    return {
      titulo: 'Tu reporte está en verificación',
      cuerpo: `Revisamos tu reporte de «${categoria}» antes de publicarlo. Te avisamos cuando esté.`,
    };
  }
  return decision === 'VERIFICADO'
    ? {
        titulo: 'Tu reporte se verificó',
        cuerpo: `Tu reporte de «${categoria}» ya está publicado en el mapa.`,
      }
    : { titulo: 'Tu reporte se desestimó', cuerpo: `Tu reporte de «${categoria}» no se publicó.` };
}

export function textoNuevoEnZona(zona: string, problema: string) {
  return { titulo: `Algo nuevo en ${zona}`, cuerpo: `Reportaron ${problema}, dentro de tu zona.` };
}
