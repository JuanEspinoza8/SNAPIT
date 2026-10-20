import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaRevision } from '../src/funcionalidades/revision/paginaRevision.js';
import type { ReportePendiente } from '../src/funcionalidades/revision/tipos.js';
import { renderRuta } from './apoyo.js';

// Leaflet no funciona en jsdom: el mapa chico se reemplaza por una marca con el punto.
vi.mock('../src/funcionalidades/revision/MapaChico.js', () => ({
  MapaChico: ({ lat, lon }: { lat: number; lon: number }) => (
    <div data-testid="mapa-chico">
      {lat},{lon}
    </div>
  ),
}));

const pendiente = (parcial: Partial<ReportePendiente>): ReportePendiente => ({
  id: 12,
  registradoEn: '2026-10-16T14:20:00.000Z',
  categoria: { id: 3, nombre: 'Cordón sin rampa' },
  severidadDeclarada: 'MODERADA',
  descripcion: 'Rampa rota en el acceso de la escuela.',
  direccion: 'General Villegas 195, Villa Farrel',
  lat: -38.9531,
  lon: -68.0478,
  origen: 'SITIO_WEB',
  nivelConfianza: 40,
  senales: [
    {
      tipo: 'EXIF_AUSENTE',
      valor: -10,
      detalle: 'La foto se eligió de la galería y no trae la ubicación donde se sacó',
    },
    { tipo: 'REPUTACION', valor: 0, detalle: 'Reputación del vecino: 50 de 100' },
  ],
  fotos: [],
  incidente: { id: 9, estado: 'REGISTRADO', cantidadReportes: 1 },
  vecino: { reputacion: 50, reportesConfirmados: 0, reportesDesestimados: 0 },
  ...parcial,
});

// Lo que tiene el "servidor": la lista y cada decisión que llegó.
let pendientes: ReportePendiente[] = [];
let decisiones: { id: number; cuerpo: unknown }[] = [];
let respuestaRevision: () => Response = () => HttpResponse.json({});

const servidor = setupServer(
  http.get('*/api/reportes/pendientes', () => HttpResponse.json({ reportes: pendientes })),
  http.post('*/api/reportes/:id/revision', async ({ params, request }) => {
    const id = Number(params.id);
    decisiones.push({ id, cuerpo: await request.json() });
    const respuesta = respuestaRevision();
    // Decidido: sale de la lista, como en el servidor de verdad.
    if (respuesta.ok) pendientes = pendientes.filter((reporte) => reporte.id !== id);
    return respuesta;
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  decisiones = [];
});
beforeEach(() => {
  localStorage.setItem('snapit:tokenAcceso', 'acceso-del-operador');
  pendientes = [pendiente({}), pendiente({ id: 15, categoria: { id: 1, nombre: 'Pozo en la calzada' } })];
  respuestaRevision = () =>
    HttpResponse.json({
      id: 12,
      estadoVerificacion: 'VERIFICADO',
      incidente: { id: 9, estado: 'VERIFICADO' },
      vecino: { reputacion: 66.67 },
    });
});

const abrir = () => renderRuta('/revision', <PaginaRevision />);
const tarjeta = async (nombre: string) =>
  (await screen.findByRole('button', { name: new RegExp(nombre) })).closest('li') as HTMLElement;

describe('revisión de reportes de baja confianza', () => {
  it('lista los pendientes con su categoría, gravedad y confianza', async () => {
    abrir();

    const primera = await tarjeta('Cordón sin rampa');
    expect(within(primera).getByText(/Moderada/)).toBeInTheDocument();
    expect(within(primera).getByText('Confianza 40')).toBeInTheDocument();
    expect(await tarjeta('Pozo en la calzada')).toBeInTheDocument();
  });

  it('al abrir un pendiente, las señales se leen en texto claro, con el punto en el mapa', async () => {
    const usuario = userEvent.setup();
    pendientes = [
      pendiente({
        senales: [
          {
            tipo: 'EXIF_AUSENTE',
            valor: -10,
            detalle: 'La foto se eligió de la galería y no trae la ubicación donde se sacó',
          },
          // Sin explicación del servidor: igual se lee qué se comprobó.
          { tipo: 'HASH_DUPLICADO', valor: -40, detalle: null },
        ],
      }),
    ];
    abrir();

    await usuario.click(await screen.findByRole('button', { name: /Cordón sin rampa/ }));

    expect(
      screen.getByText('La foto se eligió de la galería y no trae la ubicación donde se sacó'),
    ).toBeInTheDocument();
    expect(screen.getByText('Foto repetida')).toBeInTheDocument();
    expect(screen.getByText('-40')).toBeInTheDocument();
    expect(screen.getByTestId('mapa-chico')).toHaveTextContent('-38.9531,-68.0478');
  });

  it('verificar manda la decisión con el comentario y el reporte sale de la lista', async () => {
    const usuario = userEvent.setup();
    abrir();

    await usuario.click(await screen.findByRole('button', { name: /Cordón sin rampa/ }));
    await usuario.type(screen.getByLabelText(/Comentario/), 'Se ve bien la rampa rota');
    await usuario.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Cordón sin rampa/ })).not.toBeInTheDocument(),
    );
    expect(decisiones).toEqual([
      { id: 12, cuerpo: { decision: 'VERIFICADO', comentario: 'Se ve bien la rampa rota' } },
    ]);
    expect(screen.getByRole('button', { name: /Pozo en la calzada/ })).toBeInTheDocument();
  });

  it('desestimar pide confirmación antes de mandar nada', async () => {
    const usuario = userEvent.setup();
    abrir();

    await usuario.click(await screen.findByRole('button', { name: /Cordón sin rampa/ }));
    await usuario.click(screen.getByRole('button', { name: 'Desestimar' }));

    expect(screen.getByText(/¿Desestimar este reporte\?/)).toBeInTheDocument();
    expect(decisiones).toEqual([]);

    await usuario.click(screen.getByRole('button', { name: 'Sí, desestimar' }));

    await waitFor(() => expect(decisiones).toEqual([{ id: 12, cuerpo: { decision: 'DESESTIMADO' } }]));
  });

  it('cancelar la confirmación no manda nada, y cerrar la tarjeta la reinicia', async () => {
    const usuario = userEvent.setup();
    abrir();
    const encabezado = await screen.findByRole('button', { name: /Cordón sin rampa/ });

    await usuario.click(encabezado);
    await usuario.click(screen.getByRole('button', { name: 'Desestimar' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Desestimar' }));
    await usuario.click(encabezado); // se cierra
    await usuario.click(encabezado); // y se vuelve a abrir

    expect(screen.queryByText(/¿Desestimar este reporte\?/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument();
    expect(decisiones).toEqual([]);
  });

  it('si otro operador ya lo revisó, avisa en la tarjeta y lo saca de la lista', async () => {
    const usuario = userEvent.setup();
    respuestaRevision = () =>
      HttpResponse.json(
        { error: { codigo: 'REPORTE_YA_REVISADO', mensaje: 'El reporte ya fue revisado' } },
        { status: 409 },
      );
    abrir();

    await usuario.click(await screen.findByRole('button', { name: /Cordón sin rampa/ }));
    // Mientras tanto, otro operador lo resolvió: ya no está pendiente.
    pendientes = pendientes.filter((reporte) => reporte.id !== 12);
    await usuario.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Cordón sin rampa/ })).not.toBeInTheDocument(),
    );
  });

  it('un error al decidir se muestra dentro de la tarjeta, sin perder el comentario', async () => {
    const usuario = userEvent.setup();
    respuestaRevision = () =>
      HttpResponse.json(
        { error: { codigo: 'SIN_PERMISO', mensaje: 'El reporte es de un incidente de otro organismo' } },
        { status: 403 },
      );
    abrir();

    const primera = await tarjeta('Cordón sin rampa');
    await usuario.click(within(primera).getByRole('button', { name: /Cordón sin rampa/ }));
    await usuario.type(within(primera).getByLabelText(/Comentario/), 'Revisado');
    await usuario.click(within(primera).getByRole('button', { name: 'Verificar' }));

    expect(
      await within(primera).findByText('El reporte es de un incidente de otro organismo'),
    ).toBeInTheDocument();
    expect(within(primera).getByLabelText(/Comentario/)).toHaveValue('Revisado');
  });

  it('sin pendientes, lo dice', async () => {
    pendientes = [];
    abrir();

    expect(await screen.findByText('No hay reportes para revisar')).toBeInTheDocument();
  });

  it('si no puede traer la lista, muestra el error y deja reintentar', async () => {
    servidor.use(
      http.get('*/api/reportes/pendientes', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Falló el servidor' } },
          { status: 500 },
        ),
      ),
    );
    abrir();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });
});
