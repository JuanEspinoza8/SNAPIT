import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
}

const transporte = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PUERTO,
  // El 465 usa TLS desde el principio; el resto (587, o el 1025 de Mailpit) arranca sin cifrar.
  secure: env.SMTP_PUERTO === 465,
  auth: env.SMTP_USUARIO ? { user: env.SMTP_USUARIO, pass: env.SMTP_CLAVE } : undefined,
  // Por defecto nodemailer espera hasta 2 minutos a un servidor que no contesta.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

export async function enviarCorreo(correo: Correo) {
  await transporte.sendMail({
    from: env.CORREO_REMITENTE,
    to: correo.para,
    subject: correo.asunto,
    text: correo.texto,
  });
}
