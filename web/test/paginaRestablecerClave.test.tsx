import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { PaginaRestablecerClave } from '../src/funcionalidades/cuenta/paginaRestablecerClave.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

function montar(entrada: string) {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <MemoryRouter initialEntries={[entrada]}>
          <Routes>
            <Route path="/restablecer-clave" element={<PaginaRestablecerClave />} />
            <Route path="/recuperar-clave" element={<p>Recuperar clave</p>} />
          </Routes>
        </MemoryRouter>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

describe('página de restablecer clave', () => {
  it('sin token avisa que el link está incompleto', async () => {
    let llamadas = 0;
    servidor.use(
      http.post('*/api/auth/restablecer-clave', () => {
        llamadas += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    montar('/restablecer-clave');

    expect(await screen.findByText(/El link está incompleto/)).toBeInTheDocument();
    expect(llamadas).toBe(0);
  });

  it('cambia la clave y va al ingreso sin abrir sesión', async () => {
    let cuerpo: { token: string; clave: string } | null = null;
    servidor.use(
      http.post('*/api/auth/restablecer-clave', async ({ request }) => {
        cuerpo = (await request.json()) as { token: string; clave: string };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    montar('/restablecer-clave?token=enlace-123');
    await userEvent.type(screen.getByLabelText('Clave nueva'), 'clave-nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar mi clave' }));

    expect(await screen.findByRole('heading', { name: 'Clave nueva lista' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al ingreso' })).toHaveAttribute('href', '/ingreso');
    expect(cuerpo).toEqual({ token: 'enlace-123', clave: 'clave-nueva' });
    expect(localStorage.getItem('snapit:tokenAcceso')).toBeNull();
  });

  it('si los datos no sirven muestra el error y se puede reintentar sin gastar el enlace', async () => {
    servidor.use(
      http.post('*/api/auth/restablecer-clave', async ({ request }) => {
        const cuerpo = (await request.json()) as { clave: string };
        if (cuerpo.clave === '12345678') {
          return HttpResponse.json(
            { error: { codigo: 'DATOS_INVALIDOS', mensaje: 'La clave no cumple las reglas.' } },
            { status: 400 },
          );
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );

    montar('/restablecer-clave?token=enlace-123');
    await userEvent.type(screen.getByLabelText('Clave nueva'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar mi clave' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La clave no cumple las reglas.');

    await userEvent.clear(screen.getByLabelText('Clave nueva'));
    await userEvent.type(screen.getByLabelText('Clave nueva'), 'otra-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar mi clave' }));

    expect(await screen.findByRole('heading', { name: 'Clave nueva lista' })).toBeInTheDocument();
  });

  it('el error del servidor sobre la clave queda debajo del campo', async () => {
    servidor.use(
      http.post('*/api/auth/restablecer-clave', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'clave', mensaje: 'Tiene que tener hasta 72 caracteres' }],
            },
          },
          { status: 400 },
        ),
      ),
    );

    montar('/restablecer-clave?token=enlace-123');
    await userEvent.type(screen.getByLabelText('Clave nueva'), 'clave-nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar mi clave' }));

    expect(await screen.findByText('Tiene que tener hasta 72 caracteres')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con un enlace usado o vencido ofrece pedir otro en lugar de reintentar', async () => {
    servidor.use(
      http.post('*/api/auth/restablecer-clave', () =>
        HttpResponse.json(
          { error: { codigo: 'ENLACE_USADO', mensaje: 'Este enlace ya se usó.' } },
          { status: 400 },
        ),
      ),
    );

    montar('/restablecer-clave?token=enlace-123');
    await userEvent.type(screen.getByLabelText('Clave nueva'), 'clave-nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar mi clave' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este enlace ya se usó.');
    expect(screen.queryByRole('button', { name: 'Cambiar mi clave' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/recuperar-clave',
    );
  });
});
