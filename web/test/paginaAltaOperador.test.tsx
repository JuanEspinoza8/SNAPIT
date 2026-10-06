import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaAltaOperador } from '../src/funcionalidades/administracion/paginaAltaOperador.js';
import type { Usuario } from '../src/compartido/sesion/usuario.js';
import { renderRuta } from './apoyo.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

const organismo = {
  id: 1,
  nombre: 'Municipalidad de Neuquén',
  areas: [
    { id: 1, nombre: 'Bacheo' },
    { id: 2, nombre: 'Veredas' },
  ],
};

const operadorActual: Usuario = {
  id: 3,
  email: 'bacheo@ejemplo.com',
  nombre: 'Operador de Bacheo',
  rol: 'OPERADOR',
  organismoId: 1,
  areaId: 1,
};

function conTodo(usuarios = [operadorActual]) {
  servidor.use(
    http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
    http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios })),
  );
}

async function llenarOperador(usuario = userEvent.setup()) {
  // Los organismos llegan de la API: hay que esperarlos antes de elegir.
  await screen.findByRole('option', { name: 'Municipalidad de Neuquén' });
  await usuario.type(screen.getByLabelText('Nombre'), 'Olga');
  await usuario.type(screen.getByLabelText('Correo'), 'olga@ejemplo.com');
  await usuario.type(screen.getByLabelText('Clave inicial'), 'clave-inicial-1');
  await usuario.selectOptions(screen.getByLabelText('Organismo'), '1');
  await usuario.selectOptions(screen.getByLabelText('Área'), '1');
}

describe('alta de operadores', () => {
  it('carga los organismos y las áreas del organismo elegido', async () => {
    conTodo();
    const usuario = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await screen.findByRole('option', { name: 'Municipalidad de Neuquén' });
    await usuario.selectOptions(screen.getByLabelText('Organismo'), '1');

    expect(screen.getByLabelText('Área')).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Bacheo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Veredas' })).toBeInTheDocument();
  });

  it('da de alta a un operador, limpia el form y refresca la lista', async () => {
    let lista = [operadorActual];
    let cuerpo: Record<string, unknown> | null = null;
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: lista })),
      http.post('*/api/admin/usuarios', async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>;
        const creado: Usuario = {
          id: 4,
          email: String(cuerpo.email),
          nombre: String(cuerpo.nombre),
          rol: 'OPERADOR',
          organismoId: Number(cuerpo.organismoId),
          areaId: Number(cuerpo.areaId),
        };
        lista = [...lista, creado];
        return HttpResponse.json({ usuario: creado }, { status: 201 });
      }),
    );
    const usuario = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText(/Operador dado de alta/)).toBeInTheDocument();
    expect(cuerpo).toEqual({
      email: 'olga@ejemplo.com',
      clave: 'clave-inicial-1',
      nombre: 'Olga',
      rol: 'OPERADOR',
      organismoId: 1,
      areaId: 1,
    });
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByLabelText('Correo')).toHaveValue('');
    expect(screen.getByLabelText('Clave inicial')).toHaveValue('');
    expect(await screen.findByText('olga@ejemplo.com')).toBeInTheDocument();
  });

  it('un operador sin área no envía: marca el campo', async () => {
    conTodo();
    let llamadas = 0;
    servidor.use(
      http.post('*/api/admin/usuarios', () => {
        llamadas += 1;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const usuario = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await screen.findByRole('option', { name: 'Municipalidad de Neuquén' });
    await usuario.type(screen.getByLabelText('Nombre'), 'Olga');
    await usuario.type(screen.getByLabelText('Correo'), 'olga@ejemplo.com');
    await usuario.type(screen.getByLabelText('Clave inicial'), 'clave-inicial-1');
    await usuario.selectOptions(screen.getByLabelText('Organismo'), '1');
    await usuario.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText('Es obligatoria')).toBeInTheDocument();
    expect(llamadas).toBe(0);
  });

  it('muestra el detalle del servidor en su campo sin perder lo cargado', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
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
    const usuario = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(screen.getByText('El área no pertenece a ese organismo')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Olga');
    expect(screen.getByLabelText('Correo')).toHaveValue('olga@ejemplo.com');
    expect(screen.getByLabelText('Clave inicial')).toHaveValue('clave-inicial-1');
  });

  it('un correo en uso se marca sobre el campo y no aparece el aviso general', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
      http.post('*/api/admin/usuarios', () =>
        HttpResponse.json(
          { error: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya hay una cuenta con ese correo' } },
          { status: 409 },
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText('Ya hay una cuenta con ese correo')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveValue('olga@ejemplo.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un administrador no pide área y puede quedar sin organismo', async () => {
    let cuerpo: Record<string, unknown> | null = null;
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
      http.post('*/api/admin/usuarios', async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>;
        const creado: Usuario = {
          id: 5,
          email: String(cuerpo.email),
          nombre: String(cuerpo.nombre),
          rol: 'ADMINISTRADOR',
          organismoId: null,
          areaId: null,
        };
        return HttpResponse.json({ usuario: creado }, { status: 201 });
      }),
    );
    const usuario = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await usuario.selectOptions(screen.getByLabelText('Rol'), 'ADMINISTRADOR');
    expect(screen.queryByLabelText('Área')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Organismo (opcional)')).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Nombre'), 'Ana');
    await usuario.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await usuario.type(screen.getByLabelText('Clave inicial'), 'clave-inicial-1');
    await usuario.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText(/Administrador dado de alta/)).toBeInTheDocument();
    expect(cuerpo).toEqual({
      email: 'ana@ejemplo.com',
      clave: 'clave-inicial-1',
      nombre: 'Ana',
      rol: 'ADMINISTRADOR',
      organismoId: null,
      areaId: null,
    });
  });

  it('muestra la lista de usuarios con el rol y su organismo', async () => {
    const admin: Usuario = {
      id: 1,
      email: 'admin@ejemplo.com',
      nombre: 'Administración Municipal',
      rol: 'ADMINISTRADOR',
      organismoId: 1,
      areaId: null,
    };
    conTodo([admin, operadorActual]);
    renderRuta('/administracion', <PaginaAltaOperador />);

    const filaAdmin = (await screen.findByText('admin@ejemplo.com')).closest('li')!;
    expect(within(filaAdmin).getByText('Administración Municipal')).toBeInTheDocument();
    expect(within(filaAdmin).getByText('Administrador')).toBeInTheDocument();
    expect(within(filaAdmin).getByText(/Municipalidad de Neuquén/)).toBeInTheDocument();

    const filaOperador = screen.getByText('bacheo@ejemplo.com').closest('li')!;
    expect(within(filaOperador).getByText('Operador de Bacheo')).toBeInTheDocument();
    expect(within(filaOperador).getByText('Operador')).toBeInTheDocument();
    expect(within(filaOperador).getByText('Municipalidad de Neuquén · Bacheo')).toBeInTheDocument();
  });

  it('si los organismos no cargan, se ve el aviso con reintentar', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error del servidor' } },
          { status: 500 },
        ),
      ),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
    );
    renderRuta('/administracion', <PaginaAltaOperador />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo|Error/i);
  });
});
