import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { CLAVE, correoNuevo, crearUsuario, ingresar, tokenDe } from './apoyo.js';

const ID_INEXISTENTE = 2147483647;

const darDeAlta = (token: string, datos: object) =>
  request(app).post('/api/admin/usuarios').set('Authorization', `Bearer ${token}`).send(datos);

const listar = (token: string) =>
  request(app).get('/api/admin/usuarios').set('Authorization', `Bearer ${token}`);

async function crearOrganismoConArea(opciones: { activos?: boolean } = {}) {
  const { activos = true } = opciones;
  const organismo = await prisma.organismo.create({
    data: { nombre: 'Organismo de prueba', activo: activos },
  });
  const area = await prisma.area.create({
    data: { organismoId: organismo.id, nombre: 'Bacheo', activa: activos },
  });
  return { organismoId: organismo.id, areaId: area.id };
}

async function datosOperador() {
  return {
    email: correoNuevo(),
    clave: CLAVE,
    nombre: 'Olga',
    rol: 'OPERADOR',
    ...(await crearOrganismoConArea()),
  };
}

describe('POST /api/admin/usuarios', () => {
  it('crea un operador con organismo y área, con el correo ya confirmado', async () => {
    const datos = await datosOperador();
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), datos);

    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({
      email: datos.email,
      nombre: 'Olga',
      rol: 'OPERADOR',
      organismoId: datos.organismoId,
      areaId: datos.areaId,
    });
    expect(res.body.usuario).not.toHaveProperty('passwordHash');

    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: datos.email } });
    expect(usuario.emailVerificadoEn).not.toBeNull();
    expect(usuario.passwordHash).not.toBe(CLAVE);
  });

  it('el operador creado puede ingresar y su token lleva el organismo y el área', async () => {
    const datos = await datosOperador();
    await darDeAlta(await tokenDe('ADMINISTRADOR'), datos);

    const res = await ingresar(datos.email, datos.clave);

    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.tokenAcceso)).toMatchObject({
      rol: 'OPERADOR',
      organismoId: datos.organismoId,
      areaId: datos.areaId,
    });
  });

  it('crea un administrador sin organismo, que también puede ingresar', async () => {
    const email = correoNuevo();
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      email,
      clave: CLAVE,
      nombre: 'Ada',
      rol: 'ADMINISTRADOR',
    });

    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({ rol: 'ADMINISTRADOR', organismoId: null, areaId: null });
    expect((await ingresar(email)).status).toBe(200);
  });

  // Un campo undefined no viaja en el JSON: es como no mandarlo.

  it('un operador sin área responde 400 y no se crea', async () => {
    const datos = { ...(await datosOperador()), areaId: undefined };
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), datos);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(res.body.error.detalles).toEqual([{ campo: 'areaId', mensaje: 'Es obligatoria' }]);
    expect(await prisma.usuario.count({ where: { email: datos.email } })).toBe(0);
  });

  it('un operador sin organismo responde 400', async () => {
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      organismoId: undefined,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'organismoId', mensaje: 'Es obligatorio' }]);
  });

  it('un área de otro organismo responde 400', async () => {
    const otro = await crearOrganismoConArea();
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      areaId: otro.areaId,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'areaId', mensaje: 'El área no pertenece a ese organismo' },
    ]);
  });

  it('un organismo y un área que no existen responden 400', async () => {
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      organismoId: ID_INEXISTENTE,
      areaId: ID_INEXISTENTE,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'organismoId', mensaje: 'No existe ese organismo' },
      { campo: 'areaId', mensaje: 'No existe esa área' },
    ]);
  });

  it('un organismo y un área inactivos responden 400', async () => {
    const inactivos = await crearOrganismoConArea({ activos: false });
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), { ...(await datosOperador()), ...inactivos });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'organismoId', mensaje: 'El organismo está inactivo' },
      { campo: 'areaId', mensaje: 'El área está inactiva' },
    ]);
  });

  it('un id que no es un entero positivo responde 400, no 500', async () => {
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      organismoId: '1',
      areaId: 2 ** 31,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'organismoId', mensaje: 'No es un id válido' },
      { campo: 'areaId', mensaje: 'No es un id válido' },
    ]);
  });

  it('no crea vecinos: el rol tiene que ser OPERADOR o ADMINISTRADOR', async () => {
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      rol: 'VECINO',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'rol', mensaje: 'Tiene que ser OPERADOR o ADMINISTRADOR' },
    ]);
  });

  it('un administrador no lleva área', async () => {
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      rol: 'ADMINISTRADOR',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'areaId', mensaje: 'Solo los operadores tienen área' },
    ]);
  });

  it('valida el correo, la clave y el nombre igual que el registro', async () => {
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      email: 'no-es-correo',
      clave: 'corta',
      nombre: '   ',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'email', mensaje: 'No es un correo válido' },
      { campo: 'clave', mensaje: 'Tiene que tener al menos 8 caracteres' },
      { campo: 'nombre', mensaje: 'Es obligatorio' },
    ]);
  });

  it('con un correo ya usado responde 409, aunque cambien las mayúsculas', async () => {
    const { email } = await crearUsuario();
    const res = await darDeAlta(await tokenDe('ADMINISTRADOR'), {
      ...(await datosOperador()),
      email: email.toUpperCase(),
    });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('EMAIL_EN_USO');
  });
});

describe('GET /api/admin/usuarios', () => {
  it('lista los usuarios de cualquier rol, sin la clave y sin los dados de baja', async () => {
    const token = await tokenDe('ADMINISTRADOR');
    const operador = (await darDeAlta(token, await datosOperador())).body.usuario;
    const vecino = await crearUsuario();
    const dadoDeBaja = await crearUsuario({ dadoDeBaja: true });

    const res = await listar(token);

    expect(res.status).toBe(200);
    const usuarios: { id: number }[] = res.body.usuarios;
    expect(usuarios).toContainEqual(operador);
    expect(usuarios.find((usuario) => usuario.id === vecino.id)).toMatchObject({ rol: 'VECINO' });
    expect(usuarios.find((usuario) => usuario.id === dadoDeBaja.id)).toBeUndefined();
    expect(usuarios.every((usuario) => !('passwordHash' in usuario))).toBe(true);
  });
});

describe('permisos de /api/admin/usuarios', () => {
  it('un vecino o un operador recibe 403 en el alta y en la lista, y no se crea nada', async () => {
    for (const rol of ['VECINO', 'OPERADOR'] as const) {
      const token = await tokenDe(rol);
      const datos = await datosOperador();

      const alta = await darDeAlta(token, datos);
      const lista = await listar(token);

      expect(alta.status).toBe(403);
      expect(alta.body.error.codigo).toBe('SIN_PERMISO');
      expect(lista.status).toBe(403);
      expect(await prisma.usuario.count({ where: { email: datos.email } })).toBe(0);
    }
  });

  it('sin sesión responde 401', async () => {
    const alta = await request(app)
      .post('/api/admin/usuarios')
      .send(await datosOperador());
    const lista = await request(app).get('/api/admin/usuarios');

    expect(alta.status).toBe(401);
    expect(lista.status).toBe(401);
  });
});
