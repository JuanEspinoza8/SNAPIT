import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaMapa } from '../src/funcionalidades/mapa/PaginaMapa.js';
import type { PuntoMapa } from '../src/funcionalidades/mapa/tipos.js';
import { renderRuta } from './apoyo.js';

// Leaflet necesita medir la pantalla y jsdom no la dibuja: se reemplaza el mapa por una lista de
// botones, uno por punto. La agrupación tiene sus propios tests (agrupar.test.ts).
vi.mock('../src/funcionalidades/mapa/MapaIncidentes.js', () => ({
  MapaIncidentes: ({
    puntos,
    alCambiarVista,
    alElegir,
  }: {
    puntos: PuntoMapa[];
    alCambiarVista: (vista: unknown) => void;
    alElegir: (id: number) => void;
  }) => {
    useEffect(() => {
      alCambiarVista({ rectangulo: { oeste: -68.1, sur: -38.97, este: -68.03, norte: -38.93 }, zoom: 14 });
    }, [alCambiarVista]);
    return (
      <ul aria-label="Mapa simulado">
        {puntos.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => alElegir(p.id)}>
              Punto {p.id}
            </button>
          </li>
        ))}
      </ul>
    );
  },
}));

const punto = (id: number, estado: PuntoMapa['estado']): PuntoMapa => ({
  id,
  lat: -38.95,
  lon: -68.06,
  categoriaId: 3,
  estado,
  enRevision: estado === 'REGISTRADO',
  primerReporteEn: '2026-10-01T12:00:00.000Z',
  cantidadReportes: 1,
});

const pedidos: URL[] = [];
const servidor = setupServer(
  http.get('*/api/categorias', () =>
    HttpResponse.json({
      categorias: [
        { id: 3, nombre: 'Cordón sin rampa' },
        { id: 4, nombre: 'Luminaria apagada' },
      ],
    }),
  ),
  http.get('*/api/incidentes', ({ request }) => {
    const url = new URL(request.url);
    pedidos.push(url);
    // Simula el filtro del servidor: con categoría 4 no hay nada.
    if (url.searchParams.get('categoriaId') === '4') return HttpResponse.json({ incidentes: [] });
    return HttpResponse.json({ incidentes: [punto(1, 'REGISTRADO'), punto(2, 'RESUELTO')] });
  }),
  http.get('*/api/incidentes/1', () =>
    HttpResponse.json({
      ...punto(1, 'REGISTRADO'),
      categoria: { id: 3, nombre: 'Cordón sin rampa' },
      cantidadVecinos: 2,
      direccion: null,
      fotos: [
        { id: 7, url: '/api/fotos/7' },
        { id: 8, url: '/api/fotos/8' },
      ],
    }),
  ),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  pedidos.length = 0;
});

describe('mapa público', () => {
  it('pide los incidentes del rectángulo visible, sin iniciar sesión', async () => {
    renderRuta('/mapa', <PaginaMapa />);

    expect(await screen.findByText('2 incidentes en esta zona')).toBeInTheDocument();
    expect(pedidos[0]?.searchParams.get('bbox')).toBe('-68.1000,-38.9700,-68.0300,-38.9300');
  });

  it('los filtros actualizan el mapa sin recargar la página', async () => {
    const usuario = userEvent.setup();
    renderRuta('/mapa', <PaginaMapa />);
    await screen.findByText('2 incidentes en esta zona');

    await usuario.selectOptions(screen.getByLabelText('Categoría'), 'Luminaria apagada');
    expect(await screen.findByText('0 incidentes en esta zona')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Punto 1' })).not.toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'Resuelto');
    await usuario.type(screen.getByLabelText('Desde'), '2026-10-01');
    await usuario.type(screen.getByLabelText('Hasta'), '2026-10-05');

    await waitFor(() => {
      const ultimo = pedidos.at(-1)!.searchParams;
      expect(Object.fromEntries(ultimo)).toEqual({
        bbox: '-68.1000,-38.9700,-68.0300,-38.9300',
        categoriaId: '4',
        estado: 'RESUELTO',
        desde: '2026-10-01',
        hasta: '2026-10-05',
      });
    });
  });

  it('limpiar los filtros vuelve a mostrar todo', async () => {
    const usuario = userEvent.setup();
    renderRuta('/mapa', <PaginaMapa />);
    await screen.findByText('2 incidentes en esta zona');

    await usuario.selectOptions(screen.getByLabelText('Categoría'), 'Luminaria apagada');
    await screen.findByText('0 incidentes en esta zona');
    await usuario.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(await screen.findByText('2 incidentes en esta zona')).toBeInTheDocument();
  });

  it('al tocar un punto abre la ficha con el estado escrito, los vecinos y las fotos', async () => {
    const usuario = userEvent.setup();
    renderRuta('/mapa', <PaginaMapa />);

    await usuario.click(await screen.findByRole('button', { name: 'Punto 1' }));

    const ficha = await screen.findByRole('complementary', { name: 'Ficha del incidente' });
    expect(await within(ficha).findByRole('heading', { name: 'Cordón sin rampa' })).toBeInTheDocument();
    expect(within(ficha).getByText('En revisión')).toBeInTheDocument();
    expect(within(ficha).getByText('2')).toBeInTheDocument();
    expect(within(ficha).getByText('1 de octubre de 2026')).toBeInTheDocument();
    const fotos = within(ficha).getAllByRole('img');
    // En los tests la API es http://localhost:3000/api (vite.config.ts); en el navegador, /api.
    expect(fotos.map((foto) => foto.getAttribute('src'))).toEqual([
      'http://localhost:3000/api/fotos/7',
      'http://localhost:3000/api/fotos/8',
    ]);

    await usuario.click(within(ficha).getByRole('button', { name: 'Cerrar la ficha' }));
    expect(screen.queryByRole('complementary', { name: 'Ficha del incidente' })).not.toBeInTheDocument();
  });

  it('las referencias explican cada estado con texto', async () => {
    renderRuta('/mapa', <PaginaMapa />);

    const referencias = screen.getByRole('region', { name: 'Referencias' });
    for (const texto of ['En revisión', 'Verificado', 'Derivado al área', 'En ejecución', 'Resuelto']) {
      expect(within(referencias).getByText(texto)).toBeInTheDocument();
    }
  });

  it('si el servidor falla, muestra el error y deja reintentar', async () => {
    servidor.use(
      http.get('*/api/incidentes', () =>
        HttpResponse.json(
          { error: { codigo: 'DATOS_INVALIDOS', mensaje: 'Hay datos inválidos' } },
          { status: 400 },
        ),
      ),
    );
    renderRuta('/mapa', <PaginaMapa />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Hay datos inválidos');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
