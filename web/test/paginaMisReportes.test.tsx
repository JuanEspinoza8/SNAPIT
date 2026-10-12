import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion, useSesion } from '../src/compartido/sesion/sesionContexto.js';
import type { Usuario } from '../src/compartido/sesion/usuario.js';
import { PaginaIngreso } from '../src/funcionalidades/cuenta/paginaIngreso.js';
import { PaginaMisReportes } from '../src/funcionalidades/misReportes/paginaMisReportes.js';
import type { ReporteMio } from '../src/funcionalidades/misReportes/tipos.js';
import { renderRuta } from './apoyo.js';

const reporte = (parcial: Partial<ReporteMio>): ReporteMio => ({
  id: 1,
  registradoEn: '2026-10-01T12:00:00.000Z',
  categoria: { id: 3, nombre: 'Cordón sin rampa' },
  severidadDeclarada: 'GRAVE',
  descripcion: null,
  fotos: [],
  estadoVerificacion: 'PENDIENTE_REVISION',
  incidente: null,
  ...parcial,
});

const ficha = {
  id: 2,
  lat: -38.9516,
  lon: -68.0591,
  categoria: { id: 3, nombre: 'Cordón sin rampa' },
  estado: 'RESUELTO',
  enRevision: false,
  primerReporteEn: '2026-09-15T10:00:00.000Z',
  cantidadReportes: 3,
  cantidadVecinos: 2,
  direccion: null,
  fotos: [],
};

const servidor = setupServer(
  http.get('*/api/reportes/mios', () => HttpResponse.json({ reportes: [] })),
  http.get('*/api/incidentes/2', () => HttpResponse.json(ficha)),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

const conReportes = (...reportes: ReporteMio[]) =>
  servidor.use(http.get('*/api/reportes/mios', () => HttpResponse.json({ reportes })));

describe('ver mis reportes', () => {
  it('muestra categoría, fecha, estado con texto y la foto de cada reporte', async () => {
    conReportes(
      reporte({
        categoria: { id: 3, nombre: 'Cordón sin rampa' },
        registradoEn: '2026-10-01T12:00:00.000Z',
        incidente: { id: 2, estado: 'REGISTRADO', enRevision: true },
        fotos: [{ id: 7, url: '/api/fotos/7' }],
      }),
    );
    const { container } = renderRuta('/mis-reportes', <PaginaMisReportes />);

    expect(await screen.findByText('Cordón sin rampa')).toBeInTheDocument();
    expect(screen.getByText('1 oct 2026')).toBeInTheDocument();
    expect(screen.getByText('En revisión')).toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/fotos/7');
  });

  it('el reporte desestimado se muestra como «Desestimado» y no abre ficha', async () => {
    conReportes(
      reporte({
        categoria: { id: 2, nombre: 'Vereda rota' },
        estadoVerificacion: 'DESESTIMADO',
        incidente: { id: 5, estado: 'DESESTIMADO', enRevision: false },
      }),
    );
    renderRuta('/mis-reportes', <PaginaMisReportes />);

    expect(await screen.findByText('Desestimado')).toBeInTheDocument();
    expect(screen.getByText('Foto no disponible')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vereda rota/ })).not.toBeInTheDocument();
  });

  it('si la foto no se puede bajar (404), queda el recuadro y no un error', async () => {
    conReportes(reporte({ fotos: [{ id: 7, url: '/api/fotos/7' }] }));
    const { container } = renderRuta('/mis-reportes', <PaginaMisReportes />);

    await screen.findByText('Cordón sin rampa');
    fireEvent.error(container.querySelector('img')!);

    expect(screen.getByText('Foto no disponible')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si no hay reportes, lo dice y ofrece reportar', async () => {
    renderRuta('/mis-reportes', <PaginaMisReportes />);

    expect(await screen.findByText('Todavía no hiciste reportes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reportar un problema' })).toHaveAttribute('href', '/reportar');
  });

  it('al tocar un reporte con incidente abre la ficha en la misma página', async () => {
    conReportes(
      reporte({
        categoria: { id: 3, nombre: 'Cordón sin rampa' },
        incidente: { id: 2, estado: 'REGISTRADO', enRevision: true },
      }),
    );
    const usuario = userEvent.setup();
    renderRuta('/mis-reportes', <PaginaMisReportes />);

    await usuario.click(await screen.findByRole('button', { name: /Cordón sin rampa/ }));

    const panel = await screen.findByRole('complementary', { name: 'Ficha del incidente' });
    expect(within(panel).getByRole('heading', { name: 'Cordón sin rampa' })).toBeInTheDocument();
    expect(within(panel).getByText('Resuelto')).toBeInTheDocument();
  });

  it('si el servidor falla, muestra el error y deja reintentar', async () => {
    servidor.use(
      http.get('*/api/reportes/mios', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR', mensaje: 'No se pudieron traer tus reportes' } },
          { status: 500 },
        ),
      ),
    );
    renderRuta('/mis-reportes', <PaginaMisReportes />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron traer tus reportes');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('al cambiar de sesión en la misma pestaña', () => {
  const vecino = (id: number, email: string): Usuario => ({
    id,
    email,
    nombre: email,
    rol: 'VECINO',
    organismoId: null,
    areaId: null,
  });

  /** «Mis reportes» con un botón para salir, como el del encabezado. */
  function MisReportesConSalir() {
    const { salir } = useSesion();
    const navegar = useNavigate();
    return (
      <>
        <button type="button" onClick={() => void salir().then(() => navegar('/ingreso'))}>
          Salir
        </button>
        <PaginaMisReportes />
      </>
    );
  }

  it('quien ingresa después no ve los reportes de la sesión anterior', async () => {
    localStorage.setItem('snapit:tokenAcceso', 'acceso-a');
    localStorage.setItem('snapit:tokenRenovacion', 'renovacion-a');
    let responderB = () => {};
    const respuestaB = new Promise<void>((resolver) => (responderB = resolver));
    servidor.use(
      http.get('*/api/auth/yo', () => HttpResponse.json({ usuario: vecino(1, 'a@ejemplo.com') })),
      http.post('*/api/auth/salir', () => new HttpResponse(null, { status: 204 })),
      http.post('*/api/auth/ingreso', () =>
        HttpResponse.json({
          tokenAcceso: 'acceso-b',
          tokenRenovacion: 'renovacion-b',
          usuario: vecino(2, 'b@ejemplo.com'),
        }),
      ),
      http.get('*/api/reportes/mios', async ({ request }) => {
        if (request.headers.get('Authorization') === 'Bearer acceso-a') {
          return HttpResponse.json({ reportes: [reporte({ categoria: { id: 1, nombre: 'Reporte de A' } })] });
        }
        await respuestaB;
        return HttpResponse.json({ reportes: [reporte({ categoria: { id: 2, nombre: 'Reporte de B' } })] });
      }),
    );
    const usuario = userEvent.setup();
    const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={consulta}>
        <ProveedorCliente>
          <ProveedorSesion>
            <MemoryRouter initialEntries={['/mis-reportes']}>
              <Routes>
                <Route path="/mis-reportes" element={<MisReportesConSalir />} />
                <Route path="/ingreso" element={<PaginaIngreso />} />
                <Route path="/mapa" element={<Link to="/mis-reportes">Mis reportes</Link>} />
              </Routes>
            </MemoryRouter>
          </ProveedorSesion>
        </ProveedorCliente>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Reporte de A')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Salir' }));

    await usuario.type(await screen.findByLabelText('Correo'), 'b@ejemplo.com');
    await usuario.type(screen.getByLabelText('Clave'), 'clave-de-b');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    await usuario.click(await screen.findByRole('link', { name: 'Mis reportes' }));

    // Mientras llega la lista de B, no se ve nada de A.
    expect(await screen.findByRole('heading', { name: 'Mis reportes' })).toBeInTheDocument();
    expect(screen.queryByText('Reporte de A')).not.toBeInTheDocument();

    responderB();
    expect(await screen.findByText('Reporte de B')).toBeInTheDocument();
  });
});
