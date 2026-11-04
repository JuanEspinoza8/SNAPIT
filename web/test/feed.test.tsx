import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { haceCuanto } from '../src/compartido/formato/fechas.js';
import { PaginaIncidente } from '../src/funcionalidades/feed/PaginaIncidente.js';
import { PaginaInicio } from '../src/funcionalidades/feed/PaginaInicio.js';
import { PaginaReporte } from '../src/funcionalidades/feed/PaginaReporte.js';
import type { TarjetaFeed } from '../src/funcionalidades/feed/tipos.js';
import { renderConSesion, renderRuta } from './apoyo.js';

// Leaflet necesita medir la pantalla y jsdom no la dibuja: el mapa chico se reemplaza por una lista.
vi.mock('../src/funcionalidades/feed/MapaPuntos.js', () => ({
  MapaPuntos: ({ puntos }: { puntos: { id: number; titulo: string }[] }) => (
    <ul aria-label="Mapa simulado">
      {puntos.map((p) => (
        <li key={p.id}>{p.titulo}</li>
      ))}
    </ul>
  ),
}));

const API = 'http://localhost:3000/api';

const tarjeta = (id: number, cambios: Partial<TarjetaFeed> = {}): TarjetaFeed => ({
  id,
  lat: -38.95,
  lon: -68.06,
  categoria: { id: 1, nombre: 'Bache' },
  estado: 'VERIFICADO',
  enRevision: false,
  severidad: 'MODERADA',
  primerReporteEn: '2026-10-06T15:15:33.494Z',
  cantidadReportes: 1,
  cantidadVecinos: 1,
  direccion: 'Lanín 120, Villa Ceferino',
  resueltoEn: null,
  fotos: [{ id: id * 10, url: `/api/fotos/${id * 10}` }],
  cantidadFotos: 1,
  cantidadMeGusta: 0,
  cantidadComentarios: 0,
  ...cambios,
});

const ana = { id: 4, nombre: 'Ana Vecina' };
const bruno = { id: 5, nombre: 'Bruno Vecino' };

const servidor = setupServer();
beforeAll(() => servidor.listen());
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

/** El feed en dos páginas: la primera sin cursor y la segunda con `c1`. */
function feedEnDosPaginas() {
  const cursores: (string | null)[] = [];
  servidor.use(
    http.get(`${API}/incidentes/feed`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      cursores.push(cursor);
      return cursor === 'c1'
        ? HttpResponse.json({
            incidentes: [tarjeta(3, { categoria: { id: 2, nombre: 'Vereda rota' } })],
            siguiente: null,
          })
        : HttpResponse.json({
            incidentes: [
              tarjeta(1, { severidad: 'GRAVE', cantidadMeGusta: 7, cantidadComentarios: 4 }),
              tarjeta(2, {
                categoria: { id: 3, nombre: 'Cordón sin rampa' },
                cantidadReportes: 3,
                cantidadVecinos: 3,
              }),
            ],
            siguiente: 'c1',
          });
    }),
  );
  return cursores;
}

describe('inicio (feed)', () => {
  it('muestra cada incidente con su foto, estado, gravedad, contadores y el enlace al detalle', async () => {
    feedEnDosPaginas();
    renderRuta('/', <PaginaInicio />);

    const bache = await screen.findByRole('article', { name: 'Bache' });
    expect(within(bache).getByRole('img', { name: 'Foto 1 de 1 de Bache' })).toHaveAttribute(
      'src',
      `${API}/fotos/10`,
    );
    expect(within(bache).getByText('Verificado')).toBeInTheDocument();
    expect(within(bache).getByText('Grave')).toBeInTheDocument();
    expect(within(bache).getByText('7 me gusta, 4 comentarios')).toBeInTheDocument();
    expect(within(bache).getByText('Lo reportó 1 vecino')).toBeInTheDocument();
    expect(within(bache).getByRole('link')).toHaveAttribute('href', '/incidente/1');

    const agrupado = screen.getByRole('article', { name: 'Cordón sin rampa' });
    expect(within(agrupado).getByText('Agrupado · 3 reportes del mismo problema')).toBeInTheDocument();
    expect(within(agrupado).getByText('Lo reportaron 3 vecinos')).toBeInTheDocument();
  });

  it('«Cargar más» pide la página siguiente con el cursor y avisa cuando no hay más', async () => {
    const cursores = feedEnDosPaginas();
    renderRuta('/', <PaginaInicio />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByRole('article', { name: 'Vereda rota' })).toBeInTheDocument();
    expect(cursores).toEqual([null, 'c1']);
    expect(screen.getByText('No hay más incidentes por ahora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('si no carga, lo dice y deja reintentar', async () => {
    let falla = true;
    servidor.use(
      http.get(`${API}/incidentes/feed`, () =>
        falla
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Algo salió mal' } },
              { status: 500 },
            )
          : HttpResponse.json({ incidentes: [tarjeta(1)], siguiente: null }),
      ),
    );
    renderRuta('/', <PaginaInicio />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
    falla = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article', { name: 'Bache' })).toBeInTheDocument();
  });

  it('sin incidentes muestra un mensaje', async () => {
    servidor.use(
      http.get(`${API}/incidentes/feed`, () => HttpResponse.json({ incidentes: [], siguiente: null })),
    );
    renderRuta('/', <PaginaInicio />);

    expect(await screen.findByText('Todavía no hay incidentes')).toBeInTheDocument();
  });

  it('el carrusel pasa las fotos con las flechas', async () => {
    servidor.use(
      http.get(`${API}/incidentes/feed`, () =>
        HttpResponse.json({
          incidentes: [
            tarjeta(1, {
              fotos: [
                { id: 11, url: '/api/fotos/11' },
                { id: 12, url: '/api/fotos/12' },
              ],
              cantidadFotos: 4,
            }),
          ],
          siguiente: null,
        }),
      ),
    );
    renderRuta('/', <PaginaInicio />);

    expect(await screen.findByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }));

    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto siguiente' })).toBeDisabled();
    // En la última avisa que hay más en el detalle.
    expect(screen.getByText('+2 fotos en el detalle')).toBeInTheDocument();
  });
});

describe('detalle del incidente', () => {
  function servirIncidente() {
    servidor.use(
      http.get(`${API}/incidentes/3`, () =>
        HttpResponse.json({
          ...tarjeta(3, { categoria: { id: 2, nombre: 'Vereda rota' }, severidad: 'GRAVE' }),
          cantidadVecinos: 2,
          fotos: [{ id: 31, url: '/api/fotos/31' }],
        }),
      ),
      http.get(`${API}/incidentes/3/reportes`, () =>
        HttpResponse.json({
          incidenteId: 3,
          reportes: [
            {
              id: 31,
              incidenteId: 3,
              descripcion: 'Frente al kiosco',
              creadoEn: '2026-10-06T15:15:33.494Z',
              autor: ana,
              fotos: [{ id: 31, url: '/api/fotos/31' }],
              cantidadMeGusta: 5,
              cantidadComentarios: 2,
            },
          ],
        }),
      ),
      http.get(`${API}/incidentes/3/comentarios`, () =>
        HttpResponse.json({
          incidenteId: 3,
          comentarios: [
            {
              id: 1,
              texto: 'Hay una escuela cerca',
              creadoEn: '2026-10-07T15:15:33.494Z',
              editadoEn: null,
              autor: bruno,
            },
          ],
        }),
      ),
    );
  }

  it('muestra los datos, el mapa, una foto por vecino y los comentarios del incidente', async () => {
    servirIncidente();
    renderConSesion('/incidente/3', { '/incidente/:id': <PaginaIncidente /> });

    expect(await screen.findByRole('heading', { name: 'Vereda rota', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Grave')).toBeInTheDocument();
    expect(screen.getByText('Lanín 120, Villa Ceferino')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Mapa simulado' })).toHaveTextContent('Vereda rota');

    const foto = await screen.findByRole('link', { name: 'Foto de Ana Vecina, 5 me gusta, 2 comentarios' });
    expect(foto).toHaveAttribute('href', '/reporte/31');
    expect(screen.getByRole('heading', { name: 'Fotos de los vecinos (1)' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Comentarios del incidente (1)' })).toBeInTheDocument();
    expect(screen.getByText('Hay una escuela cerca')).toBeInTheDocument();
    expect(screen.getByText('Bruno Vecino')).toBeInTheDocument();
  });

  it('si los comentarios no cargan, el resto se ve y deja reintentar', async () => {
    servirIncidente();
    let falla = true;
    servidor.use(
      http.get(`${API}/incidentes/3/comentarios`, () =>
        falla
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Algo salió mal' } },
              { status: 500 },
            )
          : HttpResponse.json({ incidenteId: 3, comentarios: [] }),
      ),
    );
    renderConSesion('/incidente/3', { '/incidente/:id': <PaginaIncidente /> });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
    expect(screen.getByRole('heading', { name: 'Vereda rota', level: 1 })).toBeInTheDocument();
    falla = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Todavía no hay comentarios.')).toBeInTheDocument();
  });
});

describe('foto de un vecino', () => {
  it('muestra el autor, la descripción, los contadores y sus comentarios', async () => {
    servidor.use(
      http.get(`${API}/reportes/31/publico`, () =>
        HttpResponse.json({
          id: 31,
          incidenteId: 3,
          descripcion: 'Frente al kiosco',
          creadoEn: '2026-10-06T15:15:33.494Z',
          autor: ana,
          fotos: [{ id: 31, url: '/api/fotos/31' }],
          cantidadMeGusta: 5,
          cantidadComentarios: 1,
        }),
      ),
      http.get(`${API}/reportes/31/comentarios`, () =>
        HttpResponse.json({
          comentarios: [
            {
              id: 2,
              texto: 'Confirmo, sigue igual',
              creadoEn: '2026-10-07T15:15:33.494Z',
              editadoEn: '2026-10-08T15:15:33.494Z',
              autor: bruno,
            },
          ],
        }),
      ),
    );
    renderConSesion('/reporte/31', { '/reporte/:id': <PaginaReporte /> });

    expect(await screen.findByRole('heading', { name: 'Reporte de Ana Vecina' })).toBeInTheDocument();
    expect(screen.getByText('Frente al kiosco')).toBeInTheDocument();
    expect(screen.getByText('5 me gusta, 1 comentario')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Volver al incidente' })).toHaveAttribute(
      'href',
      '/incidente/3',
    );
    expect(await screen.findByText('Confirmo, sigue igual')).toBeInTheDocument();
    expect(screen.getByText(/editado/)).toBeInTheDocument();
  });
});

describe('haceCuanto', () => {
  const ahora = new Date('2026-11-04T15:00:00Z');
  const hace = (ms: number) => haceCuanto(new Date(ahora.getTime() - ms), ahora);

  it('dice minutos, horas y días como una red social, y pasada una semana la fecha', () => {
    expect(hace(30_000)).toBe('hace un momento');
    expect(hace(5 * 60_000)).toBe('hace 5 min');
    expect(hace(3_600_000)).toBe('hace 1 hora');
    expect(hace(30 * 3_600_000)).toBe('ayer');
    expect(hace(6 * 86_400_000)).toBe('hace 6 días');
    expect(hace(8 * 86_400_000)).toBe('27 de octubre de 2026');
  });
});
