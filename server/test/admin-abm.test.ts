import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { idUsuarioSistema } from '../src/compartido/usuarioSistema.js';
import { otrosAdministradoresActivos } from '../src/modulos/admin/repositorio.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { CLAVE, crearOrganismoDePrueba, crearUsuario, ingresar } from './apoyo.js';

// La base de tests tiene administradores de otros tests: para probar «el único que queda» se simula la cuenta.
vi.mock('../src/modulos/admin/repositorio.js', async (original) => {
  const real = await original<typeof import('../src/modulos/admin/repositorio.js')>();
  return { ...real, otrosAdministradoresActivos: vi.fn(real.otrosAdministradoresActivos) };
});

async function administrador() {
  const usuario = await crearUsuario({ rol: 'ADMINISTRADOR' });
  return { usuario, token: crearTokenAcceso(usuario) };
}

const modificar = (token: string, id: number, datos: object) =>
  request(app).put(`/api/admin/usuarios/${id}`).set('Authorization', `Bearer ${token}`).send(datos);

const darDeBaja = (token: string, id: number) =>
  request(app).delete(`/api/admin/usuarios/${id}`).set('Authorization', `Bearer ${token}`);

describe('PUT /api/admin/usuarios/:id', () => {
  it('cambia el nombre, el rol, el organismo y el área', async () => {
    const { token } = await administrador();
    const vecino = await crearUsuario();
    const { organismo, area } = await crearOrganismoDePrueba();

    const res = await modificar(token, vecino.id, {
      nombre: 'Olga Operadora',
      rol: 'OPERADOR',
      organismoId: organismo.id,
      areaId: area.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({
      id: vecino.id,
      nombre: 'Olga Operadora',
      rol: 'OPERADOR',
      organismoId: organismo.id,
      areaId: area.id,
    });
    expect(res.body.usuario).not.toHaveProperty('passwordHash');
  });

  it('un operador puede quedar sin área, y un vecino sin organismo', async () => {
    const { token } = await administrador();
    const { organismo } = await crearOrganismoDePrueba();
    const operador = await crearUsuario({ rol: 'OPERADOR', organismoId: organismo.id });

    const sinArea = await modificar(token, operador.id, {
      nombre: 'Sin área',
      rol: 'OPERADOR',
      organismoId: organismo.id,
    });
    const vecino = await modificar(token, operador.id, { nombre: 'Ahora vecino', rol: 'VECINO' });

    expect(sinArea.body.usuario).toMatchObject({ areaId: null });
    expect(vecino.body.usuario).toMatchObject({ rol: 'VECINO', organismoId: null, areaId: null });
  });

  it('si cambian sus permisos, se cierran sus sesiones: tiene que volver a ingresar', async () => {
    const { token } = await administrador();
    const { organismo } = await crearOrganismoDePrueba();
    const vecino = await crearUsuario();
    const sesion = await ingresar(vecino.email);
    const renovar = () =>
      request(app).post('/api/auth/renovar').send({ tokenRenovacion: sesion.body.tokenRenovacion });

    await modificar(token, vecino.id, { nombre: 'Persona', rol: 'OPERADOR', organismoId: organismo.id });

    expect((await renovar()).status).toBe(401);
    const nueva = await ingresar(vecino.email, CLAVE);
    expect(nueva.body.usuario).toMatchObject({ rol: 'OPERADOR', organismoId: organismo.id });
  });

  it('nadie se quita a sí mismo el rol de administrador', async () => {
    const { usuario, token } = await administrador();

    const res = await modificar(token, usuario.id, { nombre: 'Yo', rol: 'VECINO' });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('SOBRE_SI_MISMO');
  });

  it('no deja el sistema sin administradores', async () => {
    const { token } = await administrador();
    const otro = await crearUsuario({ rol: 'ADMINISTRADOR' });
    vi.mocked(otrosAdministradoresActivos).mockResolvedValueOnce(0);

    const res = await modificar(token, otro.id, { nombre: 'Otro', rol: 'VECINO' });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('ULTIMO_ADMINISTRADOR');
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: otro.id } })).rol).toBe('ADMINISTRADOR');
  });

  it('valida los datos: un área de otro organismo, un vecino con organismo o un rol que no existe', async () => {
    const { token } = await administrador();
    const usuario = await crearUsuario();
    const uno = await crearOrganismoDePrueba();
    const otro = await crearOrganismoDePrueba();

    const areaAjena = await modificar(token, usuario.id, {
      nombre: 'X',
      rol: 'OPERADOR',
      organismoId: uno.organismo.id,
      areaId: otro.area.id,
    });
    const vecinoConOrganismo = await modificar(token, usuario.id, {
      nombre: 'X',
      rol: 'VECINO',
      organismoId: uno.organismo.id,
    });
    const rolInventado = await modificar(token, usuario.id, { nombre: 'X', rol: 'JEFE' });

    expect(areaAjena.body.error.detalles).toEqual([
      { campo: 'areaId', mensaje: 'El área no pertenece a ese organismo' },
    ]);
    expect(vecinoConOrganismo.status).toBe(400);
    expect(rolInventado.status).toBe(400);
  });

  it('un usuario dado de baja o inexistente responde 404; SnapIt no se modifica', async () => {
    const { token } = await administrador();
    const dadoDeBaja = await crearUsuario({ dadoDeBaja: true });
    const sistemaId = await idUsuarioSistema();

    expect((await modificar(token, dadoDeBaja.id, { nombre: 'X', rol: 'VECINO' })).status).toBe(404);
    expect((await modificar(token, 2147483647, { nombre: 'X', rol: 'VECINO' })).status).toBe(404);
    const sistema = await modificar(token, sistemaId!, { nombre: 'X', rol: 'VECINO' });
    expect(sistema.status).toBe(409);
    expect(sistema.body.error.codigo).toBe('USUARIO_DEL_SISTEMA');
  });
});

describe('DELETE /api/admin/usuarios/:id', () => {
  it('da de baja: deja de poder ingresar y se cierran sus sesiones, pero sigue en la base', async () => {
    const { token } = await administrador();
    const vecino = await crearUsuario();
    const sesion = await ingresar(vecino.email);

    const res = await darDeBaja(token, vecino.id);

    expect(res.status).toBe(204);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: vecino.id } })).eliminadoEn).not.toBeNull();
    expect((await ingresar(vecino.email)).status).not.toBe(200);
    const renovar = await request(app)
      .post('/api/auth/renovar')
      .send({ tokenRenovacion: sesion.body.tokenRenovacion });
    expect(renovar.status).toBe(401);
    const lista = await request(app).get('/api/admin/usuarios').set('Authorization', `Bearer ${token}`);
    expect(lista.body.usuarios.some((u: { id: number }) => u.id === vecino.id)).toBe(false);
  });

  it('nadie se da de baja a sí mismo, ni deja el sistema sin administradores', async () => {
    const { usuario, token } = await administrador();
    const otro = await crearUsuario({ rol: 'ADMINISTRADOR' });
    vi.mocked(otrosAdministradoresActivos).mockResolvedValueOnce(0);

    const mismo = await darDeBaja(token, usuario.id);
    const ultimo = await darDeBaja(token, otro.id);

    expect(mismo.body.error.codigo).toBe('SOBRE_SI_MISMO');
    expect(ultimo.body.error.codigo).toBe('ULTIMO_ADMINISTRADOR');
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: otro.id } })).eliminadoEn).toBeNull();
  });

  it('SnapIt no se da de baja, y la lista no lo muestra', async () => {
    const { token } = await administrador();
    const sistemaId = await idUsuarioSistema();

    const res = await darDeBaja(token, sistemaId!);
    const lista = await request(app).get('/api/admin/usuarios').set('Authorization', `Bearer ${token}`);

    expect(res.body.error.codigo).toBe('USUARIO_DEL_SISTEMA');
    expect(lista.body.usuarios.some((u: { id: number }) => u.id === sistemaId)).toBe(false);
  });

  it('solo un administrador puede modificar o dar de baja', async () => {
    const operador = await crearUsuario({ rol: 'OPERADOR' });
    const vecino = await crearUsuario();
    const token = crearTokenAcceso(operador);

    expect((await darDeBaja(token, vecino.id)).status).toBe(403);
    expect((await modificar(token, vecino.id, { nombre: 'X', rol: 'VECINO' })).status).toBe(403);
  });
});
