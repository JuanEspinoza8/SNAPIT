import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaRecuperarClave } from '../src/funcionalidades/cuenta/paginaRecuperarClave.js';
import { renderRuta } from './apoyo.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

describe('página de recuperar clave', () => {
  it('marca el correo vacío', async () => {
    servidor.use(http.post('*/api/auth/recuperar-clave', () => new HttpResponse(null, { status: 204 })));

    renderRuta('/recuperar-clave', <PaginaRecuperarClave />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(screen.getByText('Es obligatorio')).toBeInTheDocument();
  });

  it('al pedir el enlace muestra el aviso de revisar el correo, exista o no la cuenta', async () => {
    let cuerpo: { email: string } | null = null;
    servidor.use(
      http.post('*/api/auth/recuperar-clave', async ({ request }) => {
        cuerpo = (await request.json()) as { email: string };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderRuta('/recuperar-clave', <PaginaRecuperarClave />);
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('heading', { name: 'Revisá tu correo' })).toBeInTheDocument();
    expect(screen.getByText('ana@ejemplo.com')).toBeInTheDocument();
    expect(cuerpo).toEqual({ email: 'ana@ejemplo.com' });
  });

  it('muestra el mensaje del servidor si los datos no sirven', async () => {
    servidor.use(
      http.post('*/api/auth/recuperar-clave', () =>
        HttpResponse.json(
          { error: { codigo: 'DATOS_INVALIDOS', mensaje: 'Falta el correo o no tiene formato.' } },
          { status: 400 },
        ),
      ),
    );

    renderRuta('/recuperar-clave', <PaginaRecuperarClave />);
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falta el correo o no tiene formato.');
  });
});
