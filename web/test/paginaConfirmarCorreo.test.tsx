import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { PaginaConfirmarCorreo } from '../src/funcionalidades/cuenta/paginaConfirmarCorreo.js';

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
            <Route path="/confirmar-correo" element={<PaginaConfirmarCorreo />} />
          </Routes>
        </MemoryRouter>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

describe('página de confirmar correo', () => {
  it('sin token en la URL avisa que el link está incompleto y no llama a la API', async () => {
    let llamadas = 0;
    servidor.use(
      http.post('*/api/auth/confirmar-correo', () => {
        llamadas += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    montar('/confirmar-correo');

    expect(await screen.findByText(/El link está incompleto/)).toBeInTheDocument();
    expect(llamadas).toBe(0);
  });

  it('confirma el correo con el token de la URL', async () => {
    servidor.use(
      http.post('*/api/auth/confirmar-correo', async ({ request }) => {
        const cuerpo = (await request.json()) as { token: string };
        expect(cuerpo.token).toBe('enlace-123');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    montar('/confirmar-correo?token=enlace-123');

    expect(await screen.findByText('Correo confirmado. Ya podés ingresar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al ingreso' })).toHaveAttribute('href', '/ingreso');
    expect(localStorage.getItem('snapit:tokenAcceso')).toBeNull();
  });

  it('muestra el mensaje del servidor si el enlace venció', async () => {
    servidor.use(
      http.post('*/api/auth/confirmar-correo', () =>
        HttpResponse.json(
          { error: { codigo: 'ENLACE_VENCIDO', mensaje: 'El enlace venció. Pedí otro.' } },
          { status: 400 },
        ),
      ),
    );

    montar('/confirmar-correo?token=enlace-123');

    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace venció. Pedí otro.');
  });
});
