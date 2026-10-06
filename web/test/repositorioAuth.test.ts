import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearClienteApi } from '../src/compartido/red/cliente.js';
import type { AlmacenSesion } from '../src/compartido/red/sesion.js';
import { crearRepositorioAuth } from '../src/compartido/red/repositorioAuth.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

function crearRepositorio() {
  const almacen: AlmacenSesion = {
    leer: () => null,
    guardar() {},
    borrar() {},
  };
  const cliente = crearClienteApi({ urlBase: 'http://localhost/api', almacen });
  return crearRepositorioAuth(cliente);
}

const usuarioVecino = {
  id: 2,
  email: 'vecino@ejemplo.com',
  nombre: 'Vecino',
  rol: 'VECINO',
  organismoId: null,
  areaId: null,
};

describe('repositorio de auth', () => {
  it('ingreso devuelve los tokens y el usuario', async () => {
    servidor.use(
      http.post('*/api/auth/ingreso', () =>
        HttpResponse.json({
          tokenAcceso: 'acceso-nuevo',
          tokenRenovacion: 'renovacion-nueva',
          usuario: usuarioVecino,
        }),
      ),
    );

    const resultado = await crearRepositorio().ingreso('vecino@ejemplo.com', 'una-clave');

    expect(resultado.tokenAcceso).toBe('acceso-nuevo');
    expect(resultado.tokenRenovacion).toBe('renovacion-nueva');
    expect(resultado.usuario).toEqual(usuarioVecino);
  });

  it('registro es una petición pública: no manda token', async () => {
    servidor.use(
      http.post('*/api/auth/registro', ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull();
        return HttpResponse.json({ usuario: usuarioVecino }, { status: 201 });
      }),
    );

    const resultado = await crearRepositorio().registro('Vecino', 'vecino@ejemplo.com', 'una-clave');
    expect(resultado.usuario.id).toBe(2);
  });

  it('un 401 de ingreso no renueva la sesión y deja el mensaje del servidor', async () => {
    let renovaciones = 0;
    servidor.use(
      http.post('*/api/auth/ingreso', () =>
        HttpResponse.json(
          { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'El correo o la clave no son válidos.' } },
          { status: 401 },
        ),
      ),
      http.post('*/api/auth/renovar', () => {
        renovaciones += 1;
        return HttpResponse.json({ tokenAcceso: 'x', tokenRenovacion: 'y', usuario: usuarioVecino });
      }),
    );

    const error = await crearRepositorio()
      .ingreso('vecino@ejemplo.com', 'clave-mal')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje: 'El correo o la clave no son válidos.',
    });
    expect(renovaciones).toBe(0);
  });

  it('los enlaces y la recuperación de clave son peticiones públicas', async () => {
    servidor.use(
      http.post('*/api/auth/confirmar-correo', ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull();
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/auth/recuperar-clave', ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull();
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/auth/restablecer-clave', ({ request }) => {
        expect(request.headers.get('Authorization')).toBeNull();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const repositorio = crearRepositorio();
    await repositorio.confirmarCorreo('enlace-1');
    await repositorio.recuperarClave('ana@ejemplo.com');
    await repositorio.restablecerClave('enlace-2', 'clave-nueva');
  });
});
