import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { env } from '../src/config/env.js';
import { generarTokenAleatorio, hashToken } from '../src/modulos/auth/tokens.js';
import { CLAVE, correoNuevo, crearUsuario, ingresar } from './apoyo.js';

// El registro manda un correo: en los tests no sale a ningún servidor SMTP.
vi.mock('../src/compartido/correo.js', () => ({ enviarCorreo: vi.fn(async () => {}) }));

describe('POST /api/auth/registro', () => {
  it('crea un vecino sin confirmar, con su token de verificación', async () => {
    const email = correoNuevo();
    const res = await request(app).post('/api/auth/registro').send({ email, clave: CLAVE, nombre: 'Ana' });

    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({ email, nombre: 'Ana', rol: 'VECINO' });
    expect(res.body.usuario).not.toHaveProperty('passwordHash');

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email },
      include: { tokenAccesos: true },
    });
    expect(usuario.emailVerificadoEn).toBeNull();
    expect(usuario.passwordHash).not.toBe(CLAVE);
    expect(usuario.tokenAccesos).toHaveLength(1);
    expect(usuario.tokenAccesos[0]?.tipo).toBe('VERIFICACION_EMAIL');
  });

  it('guarda el correo en minúsculas y sin espacios', async () => {
    const email = correoNuevo();
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ email: `  ${email.toUpperCase()} `, clave: CLAVE, nombre: 'Ana' });

    expect(res.status).toBe(201);
    expect(res.body.usuario.email).toBe(email);
  });

  it('con un correo ya usado responde 409, aunque cambien las mayúsculas', async () => {
    const { email } = await crearUsuario();
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ email: email.toUpperCase(), clave: CLAVE, nombre: 'Otra' });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('EMAIL_EN_USO');
  });

  it('con datos inválidos responde 400 con un detalle por campo', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ email: 'no-es-correo', clave: 'corta', nombre: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(res.body.error.detalles).toEqual([
      { campo: 'email', mensaje: 'No es un correo válido' },
      { campo: 'clave', mensaje: 'Tiene que tener al menos 8 caracteres' },
      { campo: 'nombre', mensaje: 'Es obligatorio' },
    ]);
  });

  it('un campo que falla varias reglas aparece una sola vez', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ email: 'a'.repeat(200), clave: CLAVE, nombre: 'Ana' });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'email', mensaje: 'No es un correo válido' }]);
  });

  it('si el cuerpo no es un objeto, el detalle sale en castellano', async () => {
    const res = await request(app).post('/api/auth/registro').send([]);

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toHaveLength(1);
    expect(res.body.error.detalles[0].campo).toBe('(cuerpo)');
    expect(res.body.error.detalles[0].mensaje).toMatch(/se esperaba objeto/);
  });

  it('la clave se limita a 72 bytes, no a 72 caracteres', async () => {
    // Cada ñ ocupa dos bytes: 36 entran justo, una letra más ya no.
    const justa = await request(app)
      .post('/api/auth/registro')
      .send({ email: correoNuevo(), clave: 'ñ'.repeat(36), nombre: 'Ana' });
    const larga = await request(app)
      .post('/api/auth/registro')
      .send({ email: correoNuevo(), clave: 'ñ'.repeat(36) + 'a', nombre: 'Ana' });

    expect(justa.status).toBe(201);
    expect(larga.status).toBe(400);
    expect(larga.body.error.detalles).toEqual([
      { campo: 'clave', mensaje: 'Tiene que tener hasta 72 caracteres (menos si usa tildes o ñ)' },
    ]);
  });

  it('sin cuerpo informa los tres campos obligatorios', async () => {
    const res = await request(app).post('/api/auth/registro');

    expect(res.status).toBe(400);
    expect(res.body.error.detalles.map((d: { campo: string }) => d.campo).sort()).toEqual([
      'clave',
      'email',
      'nombre',
    ]);
  });
});

describe('POST /api/auth/ingreso', () => {
  it('con datos correctos devuelve los dos tokens y el usuario', async () => {
    const usuario = await crearUsuario();
    const res = await ingresar(usuario.email);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      tokenAcceso: expect.any(String),
      tokenRenovacion: expect.any(String),
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: 'VECINO',
        organismoId: null,
        areaId: null,
      },
    });

    const datos = jwt.verify(res.body.tokenAcceso, env.JWT_SECRET) as jwt.JwtPayload;
    expect(datos.sub).toBe(String(usuario.id));
    expect(datos.rol).toBe('VECINO');
    expect(datos.exp! - datos.iat!).toBe(15 * 60);
  });

  it('con clave incorrecta o correo inexistente responde 401 igual, sin decir qué falló', async () => {
    const usuario = await crearUsuario();
    const claveMal = await ingresar(usuario.email, 'otra-clave-123');
    const correoMal = await ingresar(correoNuevo());

    expect(claveMal.status).toBe(401);
    expect(correoMal.status).toBe(401);
    expect(claveMal.body).toEqual(correoMal.body);
    expect(claveMal.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('con la cuenta sin confirmar responde 403 explicando por qué', async () => {
    const email = correoNuevo();
    await request(app).post('/api/auth/registro').send({ email, clave: CLAVE, nombre: 'Ana' });
    const res = await ingresar(email);

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('CUENTA_SIN_CONFIRMAR');
    expect(res.body.error.mensaje).toMatch(/confirm/i);
  });

  it('con la cuenta dada de baja responde 403', async () => {
    const usuario = await crearUsuario({ dadoDeBaja: true });
    const res = await ingresar(usuario.email);

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('CUENTA_DADA_DE_BAJA');
  });

  it('el estado de la cuenta no se revela con una clave incorrecta', async () => {
    const usuario = await crearUsuario({ confirmado: false });
    const res = await ingresar(usuario.email, 'otra-clave-123');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/renovar', () => {
  it('devuelve tokens nuevos y el anterior deja de servir', async () => {
    const usuario = await crearUsuario();
    const { tokenRenovacion } = (await ingresar(usuario.email)).body;

    const renovado = await request(app).post('/api/auth/renovar').send({ tokenRenovacion });
    expect(renovado.status).toBe(200);
    expect(renovado.body.tokenRenovacion).not.toBe(tokenRenovacion);
    expect(renovado.body.usuario.id).toBe(usuario.id);

    const reusado = await request(app).post('/api/auth/renovar').send({ tokenRenovacion });
    expect(reusado.status).toBe(401);
    expect(reusado.body.error.codigo).toBe('TOKEN_RENOVACION_INVALIDO');

    const otraVez = await request(app)
      .post('/api/auth/renovar')
      .send({ tokenRenovacion: renovado.body.tokenRenovacion });
    expect(otraVez.status).toBe(200);
  });

  it('dos renovaciones simultáneas con el mismo token: solo una funciona', async () => {
    const usuario = await crearUsuario();
    const { tokenRenovacion } = (await ingresar(usuario.email)).body;

    const respuestas = await Promise.all([
      request(app).post('/api/auth/renovar').send({ tokenRenovacion }),
      request(app).post('/api/auth/renovar').send({ tokenRenovacion }),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('con un token inexistente responde 401', async () => {
    const res = await request(app).post('/api/auth/renovar').send({ tokenRenovacion: 'inventado' });

    expect(res.status).toBe(401);
  });

  it('con un token vencido responde 401', async () => {
    const usuario = await crearUsuario();
    const tokenRenovacion = generarTokenAleatorio();
    await prisma.tokenAcceso.create({
      data: {
        usuarioId: usuario.id,
        tipo: 'SESION',
        tokenHash: hashToken(tokenRenovacion),
        expiraEn: new Date(Date.now() - 1000),
      },
    });

    const res = await request(app).post('/api/auth/renovar').send({ tokenRenovacion });
    expect(res.status).toBe(401);
  });

  it('si la cuenta fue dada de baja después de ingresar, no renueva', async () => {
    const usuario = await crearUsuario();
    const { tokenRenovacion } = (await ingresar(usuario.email)).body;
    await prisma.usuario.update({ where: { id: usuario.id }, data: { eliminadoEn: new Date() } });

    const res = await request(app).post('/api/auth/renovar').send({ tokenRenovacion });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/salir', () => {
  it('responde 204 y el token de renovación deja de servir', async () => {
    const usuario = await crearUsuario();
    const { tokenRenovacion } = (await ingresar(usuario.email)).body;

    const res = await request(app).post('/api/auth/salir').send({ tokenRenovacion });
    expect(res.status).toBe(204);

    const renovado = await request(app).post('/api/auth/renovar').send({ tokenRenovacion });
    expect(renovado.status).toBe(401);
  });

  it('con un token inexistente responde 204 igual', async () => {
    const res = await request(app).post('/api/auth/salir').send({ tokenRenovacion: 'inventado' });

    expect(res.status).toBe(204);
  });
});

describe('GET /api/auth/yo', () => {
  it('con un token válido devuelve el usuario', async () => {
    const usuario = await crearUsuario();
    const { tokenAcceso } = (await ingresar(usuario.email)).body;

    const res = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${tokenAcceso}`);
    expect(res.status).toBe(200);
    expect(res.body.usuario.id).toBe(usuario.id);
  });

  it('sin token responde 401 NO_AUTENTICADO', async () => {
    const res = await request(app).get('/api/auth/yo');

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('con un token adulterado responde 401 TOKEN_INVALIDO', async () => {
    const otroSecreto = jwt.sign({ rol: 'ADMINISTRADOR' }, 'un-secreto-que-no-es-el-del-servidor', {
      subject: '1',
    });
    const res = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${otroSecreto}`);

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('TOKEN_INVALIDO');
  });

  it('con un token vencido responde 401 TOKEN_VENCIDO', async () => {
    const usuario = await crearUsuario();
    const vencido = jwt.sign({ rol: 'VECINO', iat: Math.floor(Date.now() / 1000) - 3600 }, env.JWT_SECRET, {
      subject: String(usuario.id),
      expiresIn: '15m',
    });
    const res = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${vencido}`);

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('TOKEN_VENCIDO');
  });
});
