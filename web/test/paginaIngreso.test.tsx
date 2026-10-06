import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion } from '../src/compartido/sesion/sesionContexto.js';
import { PaginaIngreso } from '../src/funcionalidades/cuenta/paginaIngreso.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

function renderPaginaIngreso() {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <ProveedorSesion>
          <MemoryRouter initialEntries={['/ingreso']}>
            <Routes>
              <Route path="/" element={<p>Inicio</p>} />
              <Route path="/mapa" element={<p>Mapa</p>} />
              <Route path="/ingreso" element={<PaginaIngreso />} />
            </Routes>
          </MemoryRouter>
        </ProveedorSesion>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

describe('página de ingreso', () => {
  it('marca los campos vacíos', async () => {
    servidor.use(http.post('*/api/auth/ingreso', () => HttpResponse.json({}, { status: 401 })));

    renderPaginaIngreso();

    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(screen.getAllByText('Es obligatorio')).toHaveLength(1);
    expect(screen.getByText('Es obligatoria')).toBeInTheDocument();
  });

  it('al ingresar guarda la sesión y va a la primera sección del rol', async () => {
    servidor.use(
      http.post('*/api/auth/ingreso', () =>
        HttpResponse.json({
          tokenAcceso: 'acceso-simulado',
          tokenRenovacion: 'renovacion-simulada',
          usuario: {
            id: 2,
            email: 'vecino@ejemplo.com',
            nombre: 'Vecino',
            rol: 'VECINO',
            organismoId: null,
            areaId: null,
          },
        }),
      ),
    );

    renderPaginaIngreso();
    await userEvent.type(screen.getByLabelText('Correo'), 'vecino@ejemplo.com');
    await userEvent.type(screen.getByLabelText('Clave'), 'una-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('Mapa')).toBeInTheDocument();
    expect(localStorage.getItem('snapit:tokenAcceso')).toBe('acceso-simulado');
    expect(localStorage.getItem('snapit:tokenRenovacion')).toBe('renovacion-simulada');
  });

  it('muestra el mensaje del servidor si las credenciales no sirven', async () => {
    servidor.use(
      http.post('*/api/auth/ingreso', () =>
        HttpResponse.json(
          { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'El correo o la clave no son válidos.' } },
          { status: 401 },
        ),
      ),
    );

    renderPaginaIngreso();
    await userEvent.type(screen.getByLabelText('Correo'), 'vecino@ejemplo.com');
    await userEvent.type(screen.getByLabelText('Clave'), 'clave-mal');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El correo o la clave no son válidos.');
    expect(localStorage.getItem('snapit:tokenAcceso')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });
});
