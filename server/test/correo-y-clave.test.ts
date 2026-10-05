import type { TipoToken } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { type Correo, enviarCorreo } from '../src/compartido/correo.js';
import { prisma } from '../src/compartido/prisma.js';
import { env } from '../src/config/env.js';
import * as servicio from '../src/modulos/auth/servicio.js';
import { generarTokenAleatorio, hashToken } from '../src/modulos/auth/tokens.js';
import { CLAVE, correoNuevo, crearUsuario, ingresar } from './apoyo.js';

// Los correos no salen: quedan en el mock y cada test busca los suyos por destinatario.
vi.mock('../src/compartido/correo.js', () => ({ enviarCorreo: vi.fn(async () => {}) }));

const CLAVE_NUEVA = 'otra-clave-segura-2';

const correosPara = (email: string): Correo[] =>
  vi
    .mocked(enviarCorreo)
    .mock.calls.map(([correo]) => correo)
    .filter((correo) => correo.para === email);

/** Saca el token del link que viene en el texto del correo. */
function tokenDelLink(correo: Correo | undefined, ruta: 'confirmar-correo' | 'restablecer-clave') {
  const inicio = `${env.URL_WEB}/${ruta}?token=`;
  const link = correo?.texto.split('\n').find((linea) => linea.startsWith(inicio));
  if (!link) throw new Error(`El correo no tiene un link que empiece con ${inicio}`);
  return link.slice(inicio.length);
}

async function registrar(email = correoNuevo()) {
  const res = await request(app).post('/api/auth/registro').send({ email, clave: CLAVE, nombre: 'Ana' });
  expect(res.status).toBe(201);
  return { email, token: tokenDelLink(correosPara(email)[0], 'confirmar-correo') };
}

/** Pide recuperar la clave y espera el correo, que sale después de responder. */
async function pedirRecuperacion(email: string) {
  const anteriores = correosPara(email).length;
  const res = await request(app).post('/api/auth/recuperar-clave').send({ email });
  expect(res.status).toBe(204);
  await vi.waitFor(() => expect(correosPara(email)).toHaveLength(anteriores + 1));
  return tokenDelLink(correosPara(email).at(-1), 'restablecer-clave');
}

async function crearTokenVencido(usuarioId: number, tipo: TipoToken) {
  const token = generarTokenAleatorio();
  await prisma.tokenAcceso.create({
    data: { usuarioId, tipo, tokenHash: hashToken(token), expiraEn: new Date(Date.now() - 1000) },
  });
  return token;
}

const confirmar = (token: string) => request(app).post('/api/auth/confirmar-correo').send({ token });

const restablecer = (token: string, clave = CLAVE_NUEVA) =>
  request(app).post('/api/auth/restablecer-clave').send({ token, clave });

describe('POST /api/auth/confirmar-correo', () => {
  it('el registro manda un correo con un link que, al usarse, confirma la cuenta', async () => {
    const { email, token } = await registrar();

    const [correo] = correosPara(email);
    expect(correo?.asunto).toBe('Confirmá tu correo en SnapIt');
    expect((await ingresar(email)).status).toBe(403);

    const res = await confirmar(token);
    expect(res.status).toBe(204);

    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    expect(usuario.emailVerificadoEn).not.toBeNull();
    expect((await ingresar(email)).status).toBe(200);
  });

  it('en la base se guarda el hash del token, no el token', async () => {
    const { email, token } = await registrar();

    const [guardado] = await prisma.tokenAcceso.findMany({ where: { usuario: { email } } });
    expect(guardado?.tokenHash).toBe(hashToken(token));
    expect(guardado?.tokenHash).not.toContain(token);
  });

  it('si el correo no se puede enviar, el registro responde 201 igual', async () => {
    vi.mocked(enviarCorreo).mockRejectedValueOnce(new Error('SMTP caído'));

    const res = await request(app)
      .post('/api/auth/registro')
      .send({ email: correoNuevo(), clave: CLAVE, nombre: 'Ana' });
    expect(res.status).toBe(201);
  });

  it('un link ya usado responde 400 ENLACE_USADO', async () => {
    const { token } = await registrar();
    await confirmar(token);

    const res = await confirmar(token);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENLACE_USADO');
    expect(res.body.error.mensaje).toMatch(/ya se usó/);
  });

  it('un link vencido responde 400 ENLACE_VENCIDO y la cuenta sigue sin confirmar', async () => {
    const usuario = await crearUsuario({ confirmado: false });
    const token = await crearTokenVencido(usuario.id, 'VERIFICACION_EMAIL');

    const res = await confirmar(token);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENLACE_VENCIDO');
    expect(res.body.error.mensaje).toMatch(/venció/);

    const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(despues.emailVerificadoEn).toBeNull();
  });

  it('un token inexistente o de recuperación de clave responde 400 ENLACE_INVALIDO', async () => {
    const usuario = await crearUsuario({ confirmado: false });
    const deRecuperacion = await pedirRecuperacion(usuario.email);

    for (const token of ['inventado', deRecuperacion]) {
      const res = await confirmar(token);
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENLACE_INVALIDO');
    }
  });

  it('dos confirmaciones simultáneas con el mismo link: solo una funciona', async () => {
    const { token } = await registrar();

    const respuestas = await Promise.all([confirmar(token), confirmar(token)]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('sin token responde 400 DATOS_INVALIDOS', async () => {
    const res = await request(app).post('/api/auth/confirmar-correo');

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'token', mensaje: 'Es obligatorio' }]);
  });
});

describe('POST /api/auth/recuperar-clave', () => {
  it('responde igual exista o no el correo', async () => {
    const usuario = await crearUsuario();

    const existe = await request(app).post('/api/auth/recuperar-clave').send({ email: usuario.email });
    const noExiste = await request(app).post('/api/auth/recuperar-clave').send({ email: correoNuevo() });

    expect(existe.status).toBe(204);
    expect(noExiste.status).toBe(204);
    expect(existe.text).toBe(noExiste.text);
    await vi.waitFor(() => expect(correosPara(usuario.email)).toHaveLength(1));
  });

  it('manda un link para restablecer la clave que vence en una hora', async () => {
    const usuario = await crearUsuario();
    const token = await pedirRecuperacion(usuario.email);

    expect(correosPara(usuario.email)[0]?.asunto).toBe('Cambiá tu clave de SnapIt');
    const guardado = await prisma.tokenAcceso.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(guardado.tipo).toBe('RECUPERACION_CLAVE');
    const minutos = (guardado.expiraEn.getTime() - guardado.creadoEn.getTime()) / 60_000;
    expect(minutos).toBeCloseTo(60, 0);
  });

  it('a un correo inexistente o de una cuenta dada de baja no le manda nada', async () => {
    const inexistente = correoNuevo();
    const dadoDeBaja = await crearUsuario({ dadoDeBaja: true });

    // Se llama al servicio directo para poder esperar a que termine.
    await servicio.recuperarClave(inexistente);
    await servicio.recuperarClave(dadoDeBaja.email);

    expect(correosPara(inexistente)).toHaveLength(0);
    expect(correosPara(dadoDeBaja.email)).toHaveLength(0);
    expect(await prisma.tokenAcceso.count({ where: { usuarioId: dadoDeBaja.id } })).toBe(0);
  });

  it('si el correo no se puede enviar, el error queda en el log y no corta el servidor', async () => {
    const usuario = await crearUsuario();
    vi.mocked(enviarCorreo).mockRejectedValueOnce(new Error('SMTP caído'));

    await expect(servicio.recuperarClave(usuario.email)).resolves.toBeUndefined();
  });

  it('con un correo mal escrito responde 400', async () => {
    const res = await request(app).post('/api/auth/recuperar-clave').send({ email: 'no-es-correo' });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'email', mensaje: 'No es un correo válido' }]);
  });
});

describe('POST /api/auth/restablecer-clave', () => {
  it('cambia la clave y cierra las sesiones abiertas de ese usuario', async () => {
    const usuario = await crearUsuario();
    const celular = (await ingresar(usuario.email)).body.tokenRenovacion;
    const web = (await ingresar(usuario.email)).body.tokenRenovacion;
    const token = await pedirRecuperacion(usuario.email);

    expect((await restablecer(token)).status).toBe(204);

    for (const tokenRenovacion of [celular, web]) {
      const res = await request(app).post('/api/auth/renovar').send({ tokenRenovacion });
      expect(res.status).toBe(401);
    }
    expect((await ingresar(usuario.email)).status).toBe(401);
    expect((await ingresar(usuario.email, CLAVE_NUEVA)).status).toBe(200);
  });

  it('no toca las sesiones de otros usuarios', async () => {
    const usuario = await crearUsuario();
    const otro = await crearUsuario();
    const sesionDelOtro = (await ingresar(otro.email)).body.tokenRenovacion;

    await restablecer(await pedirRecuperacion(usuario.email));

    const res = await request(app).post('/api/auth/renovar').send({ tokenRenovacion: sesionDelOtro });
    expect(res.status).toBe(200);
  });

  it('un link ya usado responde 400 ENLACE_USADO', async () => {
    const usuario = await crearUsuario();
    const token = await pedirRecuperacion(usuario.email);
    await restablecer(token);

    const res = await restablecer(token, 'una-tercera-clave');
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENLACE_USADO');
    expect((await ingresar(usuario.email, CLAVE_NUEVA)).status).toBe(200);
  });

  it('un link vencido responde 400 ENLACE_VENCIDO y la clave no cambia', async () => {
    const usuario = await crearUsuario();
    const token = await crearTokenVencido(usuario.id, 'RECUPERACION_CLAVE');

    const res = await restablecer(token);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENLACE_VENCIDO');
    expect((await ingresar(usuario.email)).status).toBe(200);
  });

  it('un link de confirmación de correo no sirve para cambiar la clave', async () => {
    const { token } = await registrar();

    const res = await restablecer(token);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENLACE_INVALIDO');
  });

  it('usar un link anula los otros pedidos de recuperación pendientes', async () => {
    const usuario = await crearUsuario();
    const primero = await pedirRecuperacion(usuario.email);
    const segundo = await pedirRecuperacion(usuario.email);

    expect((await restablecer(segundo)).status).toBe(204);

    const res = await restablecer(primero, 'una-tercera-clave');
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENLACE_USADO');
  });

  it('también confirma el correo de una cuenta que no lo había confirmado', async () => {
    const usuario = await crearUsuario({ confirmado: false });
    const token = await pedirRecuperacion(usuario.email);

    expect((await restablecer(token)).status).toBe(204);
    expect((await ingresar(usuario.email, CLAVE_NUEVA)).status).toBe(200);
  });

  it('con una clave nueva inválida responde 400 y el link sigue sirviendo', async () => {
    const usuario = await crearUsuario();
    const token = await pedirRecuperacion(usuario.email);

    const corta = await restablecer(token, 'corta');
    expect(corta.status).toBe(400);
    expect(corta.body.error.detalles).toEqual([
      { campo: 'clave', mensaje: 'Tiene que tener al menos 8 caracteres' },
    ]);

    expect((await restablecer(token)).status).toBe(204);
  });
});
