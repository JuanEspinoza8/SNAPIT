import type { ReactElement } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion } from '../src/compartido/sesion/sesionContexto.js';
import { destinoTrasIngreso, type Rol, type Usuario } from '../src/compartido/sesion/usuario.js';
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
              <Route path="/" element={<p>Inicio</p>} />
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
      <RutaProtegida roles={['OPERADOR']}>
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
      <RutaProtegida roles={['OPERADOR']}>
        <SeccionEnConstruccion titulo="Bandeja" />
      </RutaProtegida>,
    );

    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bandeja' })).not.toBeInTheDocument();
  });

  it('un operador sí abre su bandeja', async () => {
    sembrarSesion('OPERADOR');
    montarRuta(
      '/bandeja',
      <RutaProtegida roles={['OPERADOR']}>
        <SeccionEnConstruccion titulo="Bandeja" />
      </RutaProtegida>,
    );

    expect(await screen.findByRole('heading', { name: 'Bandeja' })).toBeInTheDocument();
  });

  it('con varios roles entra cualquiera de ellos; los demás vuelven a su inicio', async () => {
    const bandeja = (
      <RutaProtegida roles={['OPERADOR', 'ADMINISTRADOR']}>
        <SeccionEnConstruccion titulo="Bandeja" />
      </RutaProtegida>
    );
    sembrarSesion('ADMINISTRADOR');
    const { unmount } = montarRuta('/bandeja', bandeja);
    expect(await screen.findByRole('heading', { name: 'Bandeja' })).toBeInTheDocument();
    unmount();

    sembrarSesion('VECINO');
    montarRuta('/bandeja', bandeja);
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bandeja' })).not.toBeInTheDocument();
  });

  it('un usuario logueado no ve el formulario de registro', async () => {
    sembrarSesion('VECINO');
    montarRuta(
      '/registro',
      <RutaSoloSinSesion>
        <p>Registro</p>
      </RutaSoloSinSesion>,
    );

    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(screen.queryByText('Registro')).not.toBeInTheDocument();
  });

  it('si no se pudo consultar la sesión, avisa y deja reintentar en lugar de mandar al ingreso', async () => {
    localStorage.setItem('snapit:tokenAcceso', 'acceso');
    localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
    let llamadas = 0;
    servidor.use(
      http.get('*/api/auth/yo', () => {
        llamadas += 1;
        return llamadas === 1
          ? HttpResponse.error()
          : HttpResponse.json({
              usuario: {
                id: 1,
                email: 'x@ejemplo.com',
                nombre: 'X',
                rol: 'OPERADOR',
                organismoId: 1,
                areaId: 1,
              },
            });
      }),
    );
    montarRuta(
      '/bandeja',
      <RutaProtegida roles={['OPERADOR']}>
        <SeccionEnConstruccion titulo="Bandeja" />
      </RutaProtegida>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo conectar con el servidor/);
    expect(screen.queryByText('Ingreso')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Bandeja' })).toBeInTheDocument();
  });
});

describe('adónde va quien ingresa', () => {
  const vecino: Usuario = {
    id: 1,
    email: 'x@ejemplo.com',
    nombre: 'X',
    rol: 'VECINO',
    organismoId: null,
    areaId: null,
  };
  const operador: Usuario = { ...vecino, rol: 'OPERADOR', organismoId: 1, areaId: 1 };

  it('vuelve a la página que pedía sesión, con sus parámetros', () => {
    expect(destinoTrasIngreso({ desde: '/reportar' }, vecino)).toBe('/reportar');
    expect(destinoTrasIngreso({ desde: '/bandeja?estado=DERIVADO' }, operador)).toBe(
      '/bandeja?estado=DERIVADO',
    );
  });

  it.each([
    ['sin estado', null],
    ['otro estado de la navegación', { foco: { lat: -38.9, lon: -68 } }],
    ['una dirección de otro sitio', { desde: '//otro.sitio/x' }],
    ['una dirección completa', { desde: 'https://otro.sitio' }],
    ['algo que no es texto', { desde: 3 }],
  ])('%s: va al inicio de su rol', (_caso, estado) => {
    expect(destinoTrasIngreso(estado, vecino)).toBe('/');
    expect(destinoTrasIngreso(estado, operador)).toBe('/bandeja');
  });
});

describe('sin sesión, la guarda recuerda adónde iba', () => {
  it('manda al ingreso con la página pedida en el estado', async () => {
    function Ingreso() {
      const { state } = useLocation();
      return <p>Ingreso desde {(state as { desde: string }).desde}</p>;
    }
    const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={consulta}>
        <ProveedorCliente>
          <ProveedorSesion>
            <MemoryRouter initialEntries={['/reportar?x=1']}>
              <Routes>
                <Route path="/ingreso" element={<Ingreso />} />
                <Route
                  path="/reportar"
                  element={
                    <RutaProtegida roles={['VECINO']}>
                      <p>Formulario</p>
                    </RutaProtegida>
                  }
                />
              </Routes>
            </MemoryRouter>
          </ProveedorSesion>
        </ProveedorCliente>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Ingreso desde /reportar?x=1')).toBeInTheDocument();
  });
});
