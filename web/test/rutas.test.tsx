import type { ReactElement } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion } from '../src/compartido/sesion/sesionContexto.js';
import type { Rol } from '../src/compartido/sesion/usuario.js';
import { SeccionEnConstruccion } from '../src/funcionalidades/comun/SeccionEnConstruccion.js';
import { RutaProtegida, RutaSoloSinSesion } from '../src/compartido/componentes/RutaProtegida.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

function sembrarSesion(rol: Rol) {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  servidor.use(
    http.get('*/api/auth/yo', () =>
      HttpResponse.json({
        usuario: { id: 1, email: 'x@ejemplo.com', nombre: 'X', rol, organismoId: null, areaId: null },
      }),
    ),
  );
}

function montarRuta(ruta: string, elemento: ReactElement) {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <ProveedorSesion>
          <MemoryRouter initialEntries={[ruta]}>
            <Routes>
              <Route path="/ingreso" element={<p>Ingreso</p>} />
              <Route path="/mapa" element={<p>Mapa</p>} />
              <Route path="/administracion" element={<p>Administración</p>} />
              <Route path={ruta} element={elemento} />
            </Routes>
          </MemoryRouter>
        </ProveedorSesion>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

describe('guardas de rutas', () => {
  it('sin sesión, una sección manda al ingreso', async () => {
    montarRuta(
      '/bandeja',
      <RutaProtegida rol="OPERADOR">
        <SeccionEnConstruccion titulo="Bandeja" />
      </RutaProtegida>,
    );

    expect(await screen.findByText('Ingreso')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bandeja' })).not.toBeInTheDocument();
  });

  it('un vecino no puede abrir la bandeja del operador', async () => {
    sembrarSesion('VECINO');
    montarRuta(
      '/bandeja',
      <RutaProtegida rol="OPERADOR">
        <SeccionEnConstruccion titulo="Bandeja" />
      </RutaProtegida>,
    );

    expect(await screen.findByText('Mapa')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bandeja' })).not.toBeInTheDocument();
  });

  it('un operador sí abre su bandeja', async () => {
    sembrarSesion('OPERADOR');
    montarRuta(
      '/bandeja',
      <RutaProtegida rol="OPERADOR">
        <SeccionEnConstruccion titulo="Bandeja" />
      </RutaProtegida>,
    );

    expect(await screen.findByRole('heading', { name: 'Bandeja' })).toBeInTheDocument();
  });

  it('un usuario logueado no ve el formulario de registro', async () => {
    sembrarSesion('VECINO');
    montarRuta(
      '/registro',
      <RutaSoloSinSesion>
        <p>Registro</p>
      </RutaSoloSinSesion>,
    );

    expect(await screen.findByText('Mapa')).toBeInTheDocument();
    expect(screen.queryByText('Registro')).not.toBeInTheDocument();
  });
});
