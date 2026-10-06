import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearClienteApi } from '../src/compartido/red/cliente.js';
import type { AlmacenSesion } from '../src/compartido/red/sesion.js';
import { crearRepositorioAdmin } from '../src/compartido/red/repositorioAdmin.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

function crearRepositorio() {
  const almacen: AlmacenSesion = {
    leer: () => ({ tokenAcceso: 'acceso-1', tokenRenovacion: 'renovacion-1' }),
    guardar() {},
    borrar() {},
  };
  const cliente = crearClienteApi({ urlBase: 'http://localhost/api', almacen });
  return crearRepositorioAdmin(cliente);
}

const operadorCreado = {
  id: 9,
  email: 'olga@ejemplo.com',
  nombre: 'Olga',
  rol: 'OPERADOR',
  organismoId: 1,
  areaId: 3,
};

const usuarioVecino = {
  id: 2,
  email: 'vecino@ejemplo.com',
  nombre: 'Vecino',
  rol: 'VECINO',
  organismoId: null,
  areaId: null,
};

describe('repositorio de administración', () => {
  it('listarOrganismos pide autenticado y devuelve organismos con sus áreas', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer acceso-1');
        return HttpResponse.json({
          organismos: [
            {
              id: 1,
              nombre: 'Municipalidad de Neuquén',
              areas: [{ id: 3, nombre: 'Bacheo' }],
            },
          ],
        });
      }),
    );

    const resultado = await crearRepositorio().listarOrganismos();
    expect(resultado.organismos).toEqual([
      { id: 1, nombre: 'Municipalidad de Neuquén', areas: [{ id: 3, nombre: 'Bacheo' }] },
    ]);
  });

  it('crearUsuario manda los datos y devuelve el usuario creado', async () => {
    let cuerpo: Record<string, unknown> | null = null;
    servidor.use(
      http.post('*/api/admin/usuarios', async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>;
        expect(request.headers.get('Authorization')).toBe('Bearer acceso-1');
        return HttpResponse.json({ usuario: operadorCreado }, { status: 201 });
      }),
    );

    const resultado = await crearRepositorio().crearUsuario({
      email: 'olga@ejemplo.com',
      clave: 'clave-inicial-1',
      nombre: 'Olga',
      rol: 'OPERADOR',
      organismoId: 1,
      areaId: 3,
    });

    expect(resultado.usuario).toEqual(operadorCreado);
    expect(cuerpo).toEqual({
      email: 'olga@ejemplo.com',
      clave: 'clave-inicial-1',
      nombre: 'Olga',
      rol: 'OPERADOR',
      organismoId: 1,
      areaId: 3,
    });
  });

  it('un 400 con detalles se propaga con el detalle de cada campo', async () => {
    servidor.use(
      http.post('*/api/admin/usuarios', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'areaId', mensaje: 'El área no pertenece a ese organismo' }],
            },
          },
          { status: 400 },
        ),
      ),
    );

    const error = await crearRepositorio()
      .crearUsuario({
        email: 'olga@ejemplo.com',
        clave: 'clave-inicial-1',
        nombre: 'Olga',
        rol: 'OPERADOR',
        organismoId: 1,
        areaId: 9,
      })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      mensaje: 'Hay datos inválidos',
      detalles: [{ campo: 'areaId', mensaje: 'El área no pertenece a ese organismo' }],
    });
  });

  it('un correo en uso se ve como EMAIL_EN_USO', async () => {
    servidor.use(
      http.post('*/api/admin/usuarios', () =>
        HttpResponse.json(
          { error: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya hay una cuenta con ese correo' } },
          { status: 409 },
        ),
      ),
    );

    const error = await crearRepositorio()
      .crearUsuario({
        email: 'vecino@ejemplo.com',
        clave: 'clave-inicial-1',
        nombre: 'Vecino',
        rol: 'OPERADOR',
        organismoId: 1,
        areaId: 3,
      })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ codigo: 'EMAIL_EN_USO', status: 409 });
  });

  it('listarUsuarios devuelve la lista de todos los roles', async () => {
    servidor.use(
      http.get('*/api/admin/usuarios', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer acceso-1');
        return HttpResponse.json({ usuarios: [usuarioVecino, operadorCreado] });
      }),
    );

    const resultado = await crearRepositorio().listarUsuarios();
    expect(resultado.usuarios).toEqual([usuarioVecino, operadorCreado]);
  });
});
