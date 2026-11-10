import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('la raíz es el inicio (el feed), público como el mapa', async () => {
    abrir('/');

    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('un vecino que abre la administración vuelve al inicio', async () => {
    abrir('/administracion', 'VECINO');

    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alta de operadores' })).not.toBeInTheDocument();
  });

  it('un operador que abre la administración vuelve a su bandeja', async () => {
    abrir('/administracion', 'OPERADOR');

    expect(await screen.findByRole('heading', { name: 'Bandeja' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alta de operadores' })).not.toBeInTheDocument();
  });

  it('un administrador abre la bandeja, como deja el servidor', async () => {
    servidor.use(
      http.get('*/api/bandeja', () => HttpResponse.json({ incidentes: [] })),
      http.get('*/api/categorias', () => HttpResponse.json({ categorias: [] })),
    );
    abrir('/bandeja', 'ADMINISTRADOR');

    expect(await screen.findByRole('heading', { name: 'Bandeja' })).toBeInTheDocument();
  });

  it('la revisión sigue siendo solo del operador: el administrador vuelve a la administración', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [] })),
    );
    abrir('/revision', 'ADMINISTRADOR');

    expect(await screen.findByRole('heading', { name: 'Alta de operadores' })).toBeInTheDocument();
  });

  it('un link viejo a «Mis reportes» lleva al perfil, donde están los reportes', async () => {
    servidor.use(http.get('*/api/reportes/mios', () => HttpResponse.json({ reportes: [] })));
    abrir('/mis-reportes', 'VECINO');

    expect(await screen.findByRole('heading', { name: 'X', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis reportes' })).toBeInTheDocument();
  });

  it('sin sesión, «Reportar» pide ingresar y después vuelve al formulario', async () => {
    servidor.use(
      http.get('*/api/incidentes/feed', () => HttpResponse.json({ incidentes: [], siguiente: null })),
      http.get('*/api/categorias', () => HttpResponse.json({ categorias: [] })),
      http.post('*/api/auth/ingreso', () =>
        HttpResponse.json({
          tokenAcceso: 'acceso',
          tokenRenovacion: 'renovacion',
          usuario: {
            id: 1,
            email: 'x@ejemplo.com',
            nombre: 'X',
            rol: 'VECINO',
            organismoId: null,
            areaId: null,
          },
        }),
      ),
    );
    const usuario = userEvent.setup();
    abrir('/');

    await usuario.click(await screen.findByRole('link', { name: 'Reportar' }));
    await usuario.type(await screen.findByLabelText('Correo'), 'x@ejemplo.com');
    await usuario.type(screen.getByLabelText('Clave'), 'una-clave');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: 'Reportar un problema' })).toBeInTheDocument();
  });

  it('un administrador abre la administración', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [] })),
    );
    abrir('/administracion', 'ADMINISTRADOR');

    expect(await screen.findByRole('heading', { name: 'Alta de operadores' })).toBeInTheDocument();
  });
});
