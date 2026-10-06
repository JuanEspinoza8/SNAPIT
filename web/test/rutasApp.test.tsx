import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { rutas } from '../src/compartido/componentes/Rutas.js';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion } from '../src/compartido/sesion/sesionContexto.js';
import type { Rol } from '../src/compartido/sesion/usuario.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

/** Monta la aplicación con las rutas reales de Rutas.tsx, en memoria. */
function abrir(ruta: string, conSesion?: Rol) {
  if (conSesion) {
    localStorage.setItem('snapit:tokenAcceso', 'acceso');
    localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
    servidor.use(
      http.get('*/api/auth/yo', () =>
        HttpResponse.json({
          usuario: {
            id: 1,
            email: 'x@ejemplo.com',
            nombre: 'X',
            rol: conSesion,
            organismoId: null,
            areaId: null,
          },
        }),
      ),
    );
  }
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <ProveedorSesion>
          <RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} />
        </ProveedorSesion>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

describe('rutas de la aplicación', () => {
  it('el mapa es público: se abre sin iniciar sesión', async () => {
    abrir('/mapa');

    expect(await screen.findByRole('heading', { name: 'Mapa' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ingresar' })).not.toBeInTheDocument();
  });

  it('un operador también puede abrir el mapa', async () => {
    abrir('/mapa', 'OPERADOR');

    expect(await screen.findByRole('heading', { name: 'Mapa' })).toBeInTheDocument();
  });

  it('reportar sí pide sesión', async () => {
    abrir('/reportar');

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
  });
});
