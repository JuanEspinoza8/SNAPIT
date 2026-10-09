import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaRegistro } from '../src/funcionalidades/cuenta/paginaRegistro.js';
import { renderRuta } from './apoyo.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

describe('página de registro', () => {
  it('marca los campos vacíos', async () => {
    servidor.use(http.post('*/api/auth/registro', () => HttpResponse.json({}, { status: 400 })));

    renderRuta('/registro', <PaginaRegistro />);

    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getAllByText('Es obligatorio')).toHaveLength(2);
    expect(screen.getByText('Es obligatoria')).toBeInTheDocument();
  });

  it('al registrarse pide confirmar el correo y no abre sesión', async () => {
    servidor.use(
      http.post('*/api/auth/registro', () =>
        HttpResponse.json(
          {
            usuario: {
              id: 2,
              email: 'vecino@ejemplo.com',
              nombre: 'Vecino',
              rol: 'VECINO',
              organismoId: null,
              areaId: null,
            },
          },
          { status: 201 },
        ),
      ),
    );

    renderRuta('/registro', <PaginaRegistro />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Vecino');
    await userEvent.type(screen.getByLabelText('Correo'), 'vecino@ejemplo.com');
    await userEvent.type(screen.getByLabelText('Clave'), 'una-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Revisá tu correo' })).toBeInTheDocument();
    expect(screen.getByText('vecino@ejemplo.com')).toBeInTheDocument();
    expect(localStorage.getItem('snapit:tokenAcceso')).toBeNull();
  });

  it('un correo en uso se marca debajo del campo, sin aviso general', async () => {
    servidor.use(
      http.post('*/api/auth/registro', () =>
        HttpResponse.json(
          { error: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya hay una cuenta con ese correo.' } },
          { status: 409 },
        ),
      ),
    );

    renderRuta('/registro', <PaginaRegistro />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Vecino');
    await userEvent.type(screen.getByLabelText('Correo'), 'vecino@ejemplo.com');
    await userEvent.type(screen.getByLabelText('Clave'), 'una-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ya hay una cuenta con ese correo.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveValue('vecino@ejemplo.com');
  });

  it('los detalles del servidor caen debajo de su campo', async () => {
    servidor.use(
      http.post('*/api/auth/registro', () =>
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

    renderRuta('/registro', <PaginaRegistro />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Vecino');
    await userEvent.type(screen.getByLabelText('Correo'), 'x@y.c');
    await userEvent.type(screen.getByLabelText('Clave'), 'una-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('No es un correo válido')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('valida el campo al salir de él y borra el error al corregirlo', async () => {
    renderRuta('/registro', <PaginaRegistro />);

    await userEvent.type(screen.getByLabelText('Correo'), 'sin-arroba');
    await userEvent.tab();
    expect(screen.getByText('No es un correo válido')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Correo'), '@ejemplo.com');
    expect(screen.queryByText('No es un correo válido')).not.toBeInTheDocument();
  });

  it('salir de un campo vacío no lo marca hasta enviar', async () => {
    renderRuta('/registro', <PaginaRegistro />);

    await userEvent.click(screen.getByLabelText('Nombre'));
    await userEvent.tab();

    expect(screen.queryByText('Es obligatorio')).not.toBeInTheDocument();
  });
});
