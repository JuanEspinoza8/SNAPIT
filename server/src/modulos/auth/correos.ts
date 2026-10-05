import type { Correo } from '../../compartido/correo.js';
import { env } from '../../config/env.js';
import { HORAS_TOKEN_RECUPERACION, HORAS_TOKEN_VERIFICACION } from './tokens.js';

// Los links llevan a páginas de la web (#9), que toman el token y llaman a la API.
export const linkConfirmacion = (token: string) => `${env.URL_WEB}/confirmar-correo?token=${token}`;
export const linkRestablecer = (token: string) => `${env.URL_WEB}/restablecer-clave?token=${token}`;

interface Destinatario {
  email: string;
  nombre: string;
}

export function correoConfirmacion(usuario: Destinatario, token: string): Correo {
  return {
    para: usuario.email,
    asunto: 'Confirmá tu correo en SnapIt',
    texto: [
      `Hola, ${usuario.nombre}:`,
      '',
      'Para terminar de crear tu cuenta en SnapIt, confirmá tu correo entrando a este enlace:',
      '',
      linkConfirmacion(token),
      '',
      `El enlace vence en ${HORAS_TOKEN_VERIFICACION} horas y sirve una sola vez.`,
      '',
      'Si no creaste una cuenta en SnapIt, ignorá este correo.',
    ].join('\n'),
  };
}

export function correoRecuperacion(usuario: Destinatario, token: string): Correo {
  return {
    para: usuario.email,
    asunto: 'Cambiá tu clave de SnapIt',
    texto: [
      `Hola, ${usuario.nombre}:`,
      '',
      'Pediste cambiar la clave de tu cuenta en SnapIt. Para elegir una nueva, entrá a este enlace:',
      '',
      linkRestablecer(token),
      '',
      `El enlace vence en ${HORAS_TOKEN_RECUPERACION} hora y sirve una sola vez.`,
      'Al cambiar la clave se cierra la sesión en todos tus dispositivos.',
      '',
      'Si no lo pediste, ignorá este correo: tu clave no cambia.',
    ].join('\n'),
  };
}
