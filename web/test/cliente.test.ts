import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearClienteApi } from '../src/compartido/red/cliente.js';
import { ErrorApi } from '../src/compartido/red/error.js';
import { crearAlmacenSesion } from '../src/compartido/red/sesion.js';
import type { AlmacenSesion } from '../src/compartido/red/sesion.js';

const urlBase = 'http://localhost:3000/api';
const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

function almacenConSesion(
  tokens = { tokenAcceso: 'acceso-viejo', tokenRenovacion: 'renovacion-vieja' },
): AlmacenSesion {
  const almacen = crearAlmacenSesion();
  almacen.guardar(tokens);
  return almacen;
}

function errorDeApi(codigo: string, mensaje: string, status: number) {
  return HttpResponse.json({ error: { codigo, mensaje } }, { status });
}

describe('cliente de la API', () => {
  it('manda el token de acceso en cada petición', async () => {
    let autorizacion: string | null = null;
    servidor.use(
      http.get('*/api/recurso', ({ request }) => {
        autorizacion = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    const cliente = crearClienteApi({ urlBase, almacen: almacenConSesion() });

    await expect(cliente.pedir('/recurso')).resolves.toEqual({ ok: true });
    expect(autorizacion).toBe('Bearer acceso-viejo');
  });

  it('arma la ruta aunque falte la barra inicial', async () => {
    let rutaVista = '';
    servidor.use(
      http.get('*/api/salud', ({ request }) => {
        rutaVista = new URL(request.url).pathname;
        return HttpResponse.json({ estado: 'ok', baseDeDatos: 'ok' });
      }),
    );

    const cliente = crearClienteApi({ urlBase, almacen: almacenConSesion() });

    await cliente.pedir('salud');
    expect(rutaVista).toBe('/api/salud');
  });

  it('ante un 401 renueva la sesión una sola vez y reintenta', async () => {
    let peticiones = 0;
    servidor.use(
      http.get('*/api/recurso', ({ request }) => {
        peticiones += 1;
        if (request.headers.get('authorization') === 'Bearer acceso-nuevo') {
          return HttpResponse.json({ ok: true });
        }
        return errorDeApi('TOKEN_VENCIDO', 'El token de acceso venció', 401);
      }),
      http.post('*/api/auth/renovar', () =>
        HttpResponse.json({
          tokenAcceso: 'acceso-nuevo',
          tokenRenovacion: 'renovacion-nueva',
        }),
      ),
    );

    const almacen = almacenConSesion();
    const cliente = crearClienteApi({ urlBase, almacen });

    await expect(cliente.pedir('/recurso')).resolves.toEqual({ ok: true });
    expect(peticiones).toBe(2);
    expect(almacen.leer()).toEqual({
      tokenAcceso: 'acceso-nuevo',
      tokenRenovacion: 'renovacion-nueva',
    });
  });

  it('si la renovación se rechaza, borra la sesión y avisa a la pantalla', async () => {
    servidor.use(
      http.get('*/api/recurso', () => errorDeApi('TOKEN_VENCIDO', 'El token de acceso venció', 401)),
      http.post('*/api/auth/renovar', () =>
        errorDeApi('TOKEN_RENOVACION_INVALIDO', 'El token de renovación ya no sirve', 401),
      ),
    );

    const almacen = almacenConSesion();
    const alPerderSesion = vi.fn();
    const cliente = crearClienteApi({ urlBase, almacen, alPerderSesion });

    // Se devuelve el 401 original: la sesión ya quedó descartada.
    await expect(cliente.pedir('/recurso')).rejects.toMatchObject({ codigo: 'TOKEN_VENCIDO' });
    expect(almacen.leer()).toBeNull();
    expect(alPerderSesion).toHaveBeenCalledOnce();
  });

  it('si dos peticiones reciben 401 a la vez, renueva una sola vez', async () => {
    let renovaciones = 0;
    servidor.use(
      http.get('*/api/recurso', ({ request }) =>
        request.headers.get('authorization') === 'Bearer acceso-nuevo'
          ? HttpResponse.json({ ok: true })
          : errorDeApi('TOKEN_VENCIDO', 'El token de acceso venció', 401),
      ),
      http.post('*/api/auth/renovar', async () => {
        renovaciones += 1;
        await delay(50);
        return HttpResponse.json({ tokenAcceso: 'acceso-nuevo', tokenRenovacion: 'renovacion-nueva' });
      }),
    );

    const cliente = crearClienteApi({ urlBase, almacen: almacenConSesion() });

    await expect(Promise.all([cliente.pedir('/recurso'), cliente.pedir('/recurso')])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(renovaciones).toBe(1);
  });

  it.each([
    ['responde 500', () => errorDeApi('ERROR_INTERNO', 'Ocurrió un error inesperado', 500)],
    ['no hay conexión', () => HttpResponse.error()],
  ])('si al renovar %s, conserva la sesión y no avisa', async (_caso, respuestaRenovar) => {
    servidor.use(
      http.get('*/api/recurso', () => errorDeApi('TOKEN_VENCIDO', 'El token de acceso venció', 401)),
      http.post('*/api/auth/renovar', respuestaRenovar),
    );

    const almacen = almacenConSesion();
    const alPerderSesion = vi.fn();
    const cliente = crearClienteApi({ urlBase, almacen, alPerderSesion });

    await expect(cliente.pedir('/recurso')).rejects.toMatchObject({ codigo: 'TOKEN_VENCIDO' });
    expect(almacen.leer()).toEqual({ tokenAcceso: 'acceso-viejo', tokenRenovacion: 'renovacion-vieja' });
    expect(alPerderSesion).not.toHaveBeenCalled();
  });

  it('si el reintento vuelve a dar 401, no renueva otra vez', async () => {
    let peticiones = 0;
    let renovaciones = 0;
    servidor.use(
      http.get('*/api/recurso', () => {
        peticiones += 1;
        return errorDeApi('TOKEN_INVALIDO', 'El token no es válido', 401);
      }),
      http.post('*/api/auth/renovar', () => {
        renovaciones += 1;
        return HttpResponse.json({ tokenAcceso: 'acceso-nuevo', tokenRenovacion: 'renovacion-nueva' });
      }),
    );

    const cliente = crearClienteApi({ urlBase, almacen: almacenConSesion() });

    await expect(cliente.pedir('/recurso')).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    expect(peticiones).toBe(2);
    expect(renovaciones).toBe(1);
  });

  it('si el token guardado ya cambió, reintenta con ese sin renovar', async () => {
    const almacen = almacenConSesion();
    let renovaciones = 0;
    servidor.use(
      http.get('*/api/recurso', ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer acceso-nuevo') {
          return HttpResponse.json({ ok: true });
        }
        // Mientras esta petición viajaba, otra ya renovó la sesión.
        almacen.guardar({ tokenAcceso: 'acceso-nuevo', tokenRenovacion: 'renovacion-nueva' });
        return errorDeApi('TOKEN_VENCIDO', 'El token de acceso venció', 401);
      }),
      http.post('*/api/auth/renovar', () => {
        renovaciones += 1;
        return HttpResponse.json({ tokenAcceso: 'otro', tokenRenovacion: 'otra' });
      }),
    );

    const cliente = crearClienteApi({ urlBase, almacen });

    await expect(cliente.pedir('/recurso')).resolves.toEqual({ ok: true });
    expect(renovaciones).toBe(0);
  });

  it('si otra pestaña ya renovó con el mismo token, usa sus tokens y no cierra la sesión', async () => {
    servidor.use(
      http.get('*/api/recurso', ({ request }) =>
        request.headers.get('authorization') === 'Bearer acceso-de-la-otra'
          ? HttpResponse.json({ ok: true })
          : errorDeApi('TOKEN_VENCIDO', 'El token de acceso venció', 401),
      ),
      http.post('*/api/auth/renovar', () => {
        // La otra pestaña gastó el token y guardó los suyos: localStorage es uno solo.
        crearAlmacenSesion().guardar({
          tokenAcceso: 'acceso-de-la-otra',
          tokenRenovacion: 'renovacion-de-la-otra',
        });
        return errorDeApi('TOKEN_RENOVACION_INVALIDO', 'El token de renovación ya no sirve', 401);
      }),
    );

    const almacen = almacenConSesion();
    const alPerderSesion = vi.fn();
    const cliente = crearClienteApi({ urlBase, almacen, alPerderSesion });

    await expect(cliente.pedir('/recurso')).resolves.toEqual({ ok: true });
    expect(almacen.leer()).toEqual({
      tokenAcceso: 'acceso-de-la-otra',
      tokenRenovacion: 'renovacion-de-la-otra',
    });
    expect(alPerderSesion).not.toHaveBeenCalled();
  });

  it('sin sesión no intenta renovar', async () => {
    let renovaciones = 0;
    servidor.use(
      http.get('*/api/recurso', () => errorDeApi('NO_AUTENTICADO', 'Falta el token', 401)),
      http.post('*/api/auth/renovar', () => {
        renovaciones += 1;
        return HttpResponse.json({ tokenAcceso: 'x', tokenRenovacion: 'y' });
      }),
    );

    const cliente = crearClienteApi({ urlBase, almacen: crearAlmacenSesion() });

    await expect(cliente.pedir('/recurso')).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    expect(renovaciones).toBe(0);
  });

  it('no renueva ni reintenta ante un 403', async () => {
    let peticiones = 0;
    servidor.use(
      http.get('*/api/recurso', () => {
        peticiones += 1;
        return errorDeApi('SIN_PERMISO', 'Tu rol no puede usar esta ruta', 403);
      }),
    );

    const cliente = crearClienteApi({ urlBase, almacen: almacenConSesion() });

    await expect(cliente.pedir('/recurso')).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
    expect(peticiones).toBe(1);
  });

  it('lee el mensaje y los detalles del error de la API', async () => {
    servidor.use(
      http.get('*/api/recurso', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'email', mensaje: 'No es un correo válido' }],
            },
          },
          { status: 400 },
        ),
      ),
    );

    const cliente = crearClienteApi({ urlBase, almacen: almacenConSesion() });

    const error = await cliente.pedir('/recurso').catch((capturado: unknown) => capturado);
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).mensaje).toBe('Hay datos inválidos');
    expect((error as ErrorApi).status).toBe(400);
    expect((error as ErrorApi).detalles).toEqual([{ campo: 'email', mensaje: 'No es un correo válido' }]);
  });
});
