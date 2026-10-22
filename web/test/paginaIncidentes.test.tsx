import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaIncidentes } from '../src/funcionalidades/incidentes/paginaIncidentes.js';
import type { ReporteDelOrganismo } from '../src/funcionalidades/revision/tipos.js';
import { renderRuta } from './apoyo.js';

function reporte(
  id: number,
  incidente: { id: number; propioId?: number },
  datos: { lat?: number; categoria?: string; registradoEn?: string } = {},
): ReporteDelOrganismo {
  return {
    id,
    registradoEn: datos.registradoEn ?? `2026-10-1${id % 10}T12:00:00Z`,
    categoria: { id: 1, nombre: datos.categoria ?? 'Pozo en la calzada' },
    severidadDeclarada: 'GRAVE',
    descripcion: `Reporte ${id}`,
    direccion: `Calle ${incidente.id}`,
    lat: datos.lat ?? -38.95,
    lon: -68.06,
    origen: 'SITIO_WEB',
    nivelConfianza: 40,
    senales: [],
    fotos: [],
    incidente: {
      id: incidente.id,
      estado: 'VERIFICADO',
      cantidadReportes: 1,
      propioId: incidente.propioId ?? incidente.id,
    },
    vecino: { reputacion: 50, reportesConfirmados: 0, reportesDesestimados: 0 },
    propuestaIa: null,
    estadoVerificacion: 'VERIFICADO',
    publicadoPorIaEn: null,
  };
}

// Incidente 10 con dos reportes; el 20, unido al 10 (el servidor lo lista dentro del principal);
// el 30, cerca del 40 (300 m) y lejos del 50 (unos 11 km).
const reportes = [
  reporte(1, { id: 10 }),
  reporte(2, { id: 10 }),
  reporte(3, { id: 10, propioId: 20 }, { categoria: 'Vereda rota' }),
  reporte(4, { id: 30 }, { lat: -38.9 }),
  reporte(5, { id: 40 }, { lat: -38.9027 }),
  reporte(6, { id: 50 }, { lat: -39.0 }),
];

const pedidos: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
const anotar = async (request: Request) => {
  const texto = await request.text();
  pedidos.push({
    metodo: request.method,
    ruta: new URL(request.url).pathname,
    cuerpo: texto ? JSON.parse(texto) : null,
  });
};
const resumido = (id: number, cantidadReportes: number) => ({
  id,
  estado: 'VERIFICADO',
  cantidadReportes,
  severidad: 'GRAVE',
});

const servidor = setupServer(
  http.get('*/api/reportes', () => HttpResponse.json({ reportes })),
  http.post('*/api/reportes/:id/separacion', async ({ request, params }) => {
    await anotar(request);
    return HttpResponse.json({
      reporteId: Number(params.id),
      incidenteNuevo: resumido(99, 1),
      incidenteOriginal: resumido(10, 2),
    });
  }),
  http.post('*/api/incidentes/:id/union', async ({ request, params }) => {
    await anotar(request);
    return HttpResponse.json({ id: Number(params.id), principal: resumido(40, 2) });
  }),
  http.delete('*/api/incidentes/:id/union', async ({ request, params }) => {
    await anotar(request);
    return HttpResponse.json({ id: Number(params.id), principal: resumido(10, 2) });
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  pedidos.length = 0;
});

const tarjeta = async (id: number) =>
  (await screen.findByText(new RegExp(`^#${id} ·`))).closest('li') as HTMLElement;

describe('corregir la agrupación de incidentes (F05)', () => {
  it('muestra cada incidente con sus reportes y los unidos dentro del principal', async () => {
    renderRuta('/incidentes', <PaginaIncidentes />);

    const principal = await tarjeta(10);
    expect(within(principal).getByText('Reporte #1 · Grave')).toBeInTheDocument();
    expect(within(principal).getByText('Reporte #2 · Grave')).toBeInTheDocument();
    // El 20 no aparece como incidente aparte: va adentro del 10.
    expect(within(principal).getByText('#20')).toBeInTheDocument();
    expect(within(principal).getByText('Reporte #3 · Grave')).toBeInTheDocument();
    expect(screen.queryByText(/^#20 ·/)).not.toBeInTheDocument();
  });

  it('separa un reporte con su comentario', async () => {
    const usuario = userEvent.setup();
    renderRuta('/incidentes', <PaginaIncidentes />);
    const principal = await tarjeta(10);

    await usuario.click(within(principal).getAllByRole('button', { name: 'Separar' })[0]!);
    await usuario.type(screen.getByLabelText('Comentario (opcional)'), 'Es otro pozo');
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Separar' }));

    expect(await screen.findByText(/quedó solo en el incidente nuevo #99/)).toBeInTheDocument();
    expect(pedidos).toEqual([
      { metodo: 'POST', ruta: '/api/reportes/1/separacion', cuerpo: { comentario: 'Es otro pozo' } },
    ]);
  });

  it('une un incidente al más cercano, que aparece primero', async () => {
    const usuario = userEvent.setup();
    renderRuta('/incidentes', <PaginaIncidentes />);
    const incidente = await tarjeta(30);

    await usuario.click(within(incidente).getByRole('button', { name: 'Unir a otro…' }));

    const opciones = screen.getAllByRole('radio');
    expect(opciones[0]).toBeChecked();
    expect(screen.getByText(/a 300 m/)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Unir al #40' }));

    expect(await screen.findByText(/El incidente #30 quedó unido al #40/)).toBeInTheDocument();
    expect(pedidos).toEqual([
      { metodo: 'POST', ruta: '/api/incidentes/30/union', cuerpo: { principalId: 40 } },
    ]);
  });

  it('deshace una unión', async () => {
    const usuario = userEvent.setup();
    renderRuta('/incidentes', <PaginaIncidentes />);
    const principal = await tarjeta(10);

    await usuario.click(within(principal).getByRole('button', { name: 'Deshacer unión' }));

    expect(await screen.findByText(/el #20 volvió a ser un incidente aparte/)).toBeInTheDocument();
    expect(pedidos).toEqual([{ metodo: 'DELETE', ruta: '/api/incidentes/20/union', cuerpo: null }]);
  });

  it('muestra el error del servidor si no se puede unir', async () => {
    servidor.use(
      http.post('*/api/incidentes/:id/union', () =>
        HttpResponse.json(
          { error: { codigo: 'INCIDENTE_CERRADO', mensaje: 'Alguno de los dos está cerrado' } },
          { status: 409 },
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderRuta('/incidentes', <PaginaIncidentes />);

    await usuario.click(within(await tarjeta(30)).getByRole('button', { name: 'Unir a otro…' }));
    await usuario.click(screen.getByRole('button', { name: 'Unir al #40' }));

    expect(await screen.findByText('Alguno de los dos está cerrado')).toBeInTheDocument();
  });
});
