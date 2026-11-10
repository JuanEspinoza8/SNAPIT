import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '../src/compartido/componentes/Layout.js';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion } from '../src/compartido/sesion/sesionContexto.js';
import type { Rol } from '../src/compartido/sesion/usuario.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

function montar(ruta: string, conSesion?: Rol) {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  servidor.use(http.post('*/api/auth/salir', () => new HttpResponse(null, { status: 204 })));
  if (conSesion) {
    localStorage.setItem('snapit:tokenAcceso', 'acceso');
    localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
    servidor.use(
      http.get('*/api/auth/yo', () =>
        HttpResponse.json({
          usuario: {
            id: 1,
            email: 'x@ejemplo.com',
            nombre: 'Nombre',
            rol: conSesion,
            organismoId: null,
            areaId: null,
          },
        }),
      ),
    );
  }
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <ProveedorSesion>
          <MemoryRouter initialEntries={[ruta]}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<p>Contenido del inicio</p>} />
                <Route path="/salud" element={<p>Contenido de salud</p>} />
                <Route path="/mapa" element={<p>Mapa</p>} />
                <Route path="/bandeja" element={<p>Bandeja</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ProveedorSesion>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

describe('layout', () => {
  it('sin sesión muestra el encabezado, el pie, el contenido y el acceso a las cuentas', () => {
    montar('/');

    expect(screen.getByRole('link', { name: 'SnapIt, ir al inicio' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/mapa');
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/ingreso');
    expect(screen.getByRole('link', { name: 'Registrarse' })).toHaveAttribute('href', '/registro');
    expect(screen.getByText('Contenido del inicio')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('SnapIt');
  });

  it('un vecino ve sus secciones y no las del operador', async () => {
    montar('/', 'VECINO');

    expect(await screen.findByText('Nombre')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/mapa');
    // Reportar no está en el menú: es el botón del inicio y del mapa.
    expect(screen.queryByRole('link', { name: 'Reportar' })).not.toBeInTheDocument();
    // El perfil, con el nombre del usuario, en el lugar de «Mis reportes» (que quedó dentro del perfil). La
    // etiqueta dice que sus reportes están ahí.
    const perfil = screen.getByRole('link', { name: 'Nombre: tu perfil y tus reportes' });
    expect(perfil).toHaveAttribute('href', '/perfil');
    expect(perfil).toHaveTextContent('Nombre');
    expect(screen.queryByRole('link', { name: 'Mis reportes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bandeja' })).not.toBeInTheDocument();
  });

  it('un operador ve su bandeja y no las secciones del vecino', async () => {
    montar('/', 'OPERADOR');

    expect(await screen.findByRole('link', { name: 'Bandeja' })).toHaveAttribute('href', '/bandeja');
    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/mapa');
    expect(screen.getByRole('link', { name: 'Nombre: tu perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.queryByRole('link', { name: 'Reportar' })).not.toBeInTheDocument();
  });

  it('un administrador ve la administración y la bandeja, pero no la revisión ni lo del vecino', async () => {
    montar('/', 'ADMINISTRADOR');

    expect(await screen.findByRole('link', { name: 'Administración' })).toHaveAttribute(
      'href',
      '/administracion',
    );
    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/mapa');
    expect(screen.getByRole('link', { name: 'Bandeja' })).toHaveAttribute('href', '/bandeja');
    expect(screen.getByRole('link', { name: 'Nombre: tu perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.queryByRole('link', { name: 'Revisión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Incidentes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reportar' })).not.toBeInTheDocument();
  });

  it('salir borra la sesión y vuelve a mostrar el acceso a las cuentas', async () => {
    montar('/', 'VECINO');
    await userEvent.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(localStorage.getItem('snapit:tokenAcceso')).toBeNull();
    expect(localStorage.getItem('snapit:tokenRenovacion')).toBeNull();
    expect(await screen.findByRole('link', { name: 'Ingresar' })).toBeInTheDocument();
  });
});
