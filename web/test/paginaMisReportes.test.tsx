import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByText('Sin foto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vereda rota/ })).not.toBeInTheDocument();
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
