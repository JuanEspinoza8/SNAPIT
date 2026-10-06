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

  it('muestra el mensaje del servidor si el correo ya está en uso', async () => {
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay una cuenta con ese correo.');
  });
});
