import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaIndicadores } from '../src/funcionalidades/indicadores/PaginaIndicadores.js';
import type { Indicadores } from '../src/funcionalidades/indicadores/tipos.js';
import { periodoInicial } from '../src/funcionalidades/informes/formato.js';
import type { Informe, ResumenInforme } from '../src/funcionalidades/informes/tipos.js';
import { renderConSesion } from './apoyo.js';

// Leaflet no anda en jsdom: el mapa de calor se reemplaza por la cantidad de puntos.
vi.mock('../src/funcionalidades/indicadores/MapaCalor.js', () => ({
  MapaCalor: ({ puntos }: { puntos: unknown[] }) => <div data-testid="mapa-calor">{puntos.length}</div>,
  LeyendaCalor: () => null,
}));

// Recharts mide su contenedor: jsdom no tiene ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const VACIOS: Indicadores = {
  abiertosPorEstado: [
    { estado: 'REGISTRADO', cantidad: 0 },
    { estado: 'VERIFICADO', cantidad: 0 },
    { estado: 'DERIVADO', cantidad: 0 },
    { estado: 'EN_EJECUCION', cantidad: 0 },
  ],
  nuevosYResueltosPorSemana: [{ semana: '2026-11-16', nuevos: 0, resueltos: 0 }],
  tiempoDeResolucion: { porCategoria: [], porArea: [], porBarrio: [] },
  barriosConMasAbiertos: [],
  reportesDesestimados: { total: 0, desestimados: 0, porcentaje: null },
};

const CON_DATOS: Indicadores = {
  abiertosPorEstado: [
    { estado: 'REGISTRADO', cantidad: 4 },
    { estado: 'VERIFICADO', cantidad: 2 },
    { estado: 'DERIVADO', cantidad: 1 },
    { estado: 'EN_EJECUCION', cantidad: 0 },
  ],
  nuevosYResueltosPorSemana: [
    { semana: '2026-11-02', nuevos: 5, resueltos: 1 },
    { semana: '2026-11-09', nuevos: 3, resueltos: 2 },
  ],
  tiempoDeResolucion: {
    porCategoria: [{ id: 1, nombre: 'Pozo en la calzada', cantidad: 2, medianaDias: 6.5, promedioDias: 7 }],
    porArea: [{ id: 1, nombre: 'Bacheo', cantidad: 3, medianaDias: 4, promedioDias: 5.2 }],
    porBarrio: [{ barrio: 'Villa Ceferino', cantidad: 1, medianaDias: 1, promedioDias: 1 }],
  },
  barriosConMasAbiertos: [
    { barrio: 'Centro', cantidad: 5 },
    { barrio: 'Villa Ceferino', cantidad: 2 },
  ],
  reportesDesestimados: { total: 20, desestimados: 3, porcentaje: 15 },
};

const categorias = [
  { id: 1, nombre: 'Pozo en la calzada', area: { id: 1, nombre: 'Bacheo' } },
  { id: 2, nombre: 'Vereda rota', area: { id: 2, nombre: 'Veredas' } },
];

const anterior: ResumenInforme = {
  id: 3,
  desde: '2026-10-01',
  hasta: '2026-10-31',
  area: { id: 2, nombre: 'Veredas' },
  barrio: 'Centro',
  solicitante: { id: 8, nombre: 'Olga Ruiz' },
  creadoEn: '2026-11-02T12:30:00.000Z',
};

const nuevo: Informe = {
  id: 4,
  desde: '2026-11-01',
  hasta: '2026-11-23',
  area: null,
  barrio: null,
  solicitante: { id: 3, nombre: 'Operador de Bacheo' },
  creadoEn: '2026-11-23T17:05:00.000Z',
  contenido:
    '## Estado general\n\nQuedan 12 incidentes abiertos.\n\n## Orden de intervención\n\n1. Incidente #31: Pozo en la calzada, Lanín 200. Lleva un mes.\n2. Incidente #12: Luminaria apagada. Está cerca de una escuela.',
  registroIaId: 88,
};

const IA_CAIDA = {
  error: {
    codigo: 'IA_NO_DISPONIBLE',
    mensaje:
      'No se pudo generar el informe: la IA no está disponible en este momento. Probá de nuevo en unos minutos.',
  },
};

let pedidos: unknown[] = [];
let indicadores: Indicadores = CON_DATOS;
/** Los filtros con que se pidió cada vez GET /api/indicadores. */
let consultas: string[] = [];
let historial: ResumenInforme[] = [];
/** Lo que responde cada POST, en orden. */
let respuestas: (() => Response | Promise<Response>)[] = [];
let pdfsPedidos: string[] = [];

const servidor = setupServer(
  http.get('*/api/auth/yo', () =>
    HttpResponse.json({
      usuario: {
        id: 3,
        email: 'bacheo@ejemplo.com',
        nombre: 'Operador de Bacheo',
        rol: 'OPERADOR',
        organismoId: 1,
        areaId: 1,
      },
    }),
  ),
  http.get('*/api/categorias', () => HttpResponse.json({ categorias })),
  http.get('*/api/indicadores', ({ request }) => {
    consultas.push(new URL(request.url).search);
    return HttpResponse.json(indicadores);
  }),
  http.get('*/api/indicadores/calor', () =>
    HttpResponse.json({
      puntos: [
        { lat: -38.95, lon: -68.06, peso: 1 },
        { lat: -38.96, lon: -68.05, peso: 0.4 },
      ],
    }),
  ),
  http.get('*/api/barrios', () => HttpResponse.json({ barrios: ['Centro', 'Villa Ceferino'] })),
  http.get('*/api/informes', () => HttpResponse.json({ informes: historial })),
  http.get('*/api/informes/:id', ({ params }) =>
    Number(params.id) === anterior.id
      ? HttpResponse.json({
          informe: { ...anterior, contenido: '## Demoras\n\nLas veredas tardan más.', registroIaId: 5 },
        })
      : HttpResponse.json(
          { error: { codigo: 'INFORME_NO_ENCONTRADO', mensaje: 'No existe el informe' } },
          { status: 404 },
        ),
  ),
  http.get('*/api/informes/:id/pdf', ({ params }) => {
    pdfsPedidos.push(String(params.id));
    return new HttpResponse('%PDF-1.3', { headers: { 'Content-Type': 'application/pdf' } });
  }),
  http.post('*/api/informes', async ({ request }) => {
    pedidos.push(await request.json());
    const responder = respuestas.shift() ?? (() => HttpResponse.json({ informe: nuevo }, { status: 201 }));
    return responder();
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
beforeEach(() => {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  pedidos = [];
  indicadores = CON_DATOS;
  consultas = [];
  historial = [anterior];
  respuestas = [];
  pdfsPedidos = [];
});
afterEach(() => {
  servidor.resetHandlers();
  vi.restoreAllMocks();
});

const montar = (entrada = '/indicadores') =>
  renderConSesion(entrada, { '/indicadores': <PaginaIndicadores /> });
const ubicacion = () => screen.getByTestId('ubicacion').textContent;
const generar = () => screen.getByRole('button', { name: 'Generar informe con estos filtros' });

describe('informe con IA en el panel', () => {
  it('genera un informe con los filtros del panel y el barrio, y lo muestra por secciones', async () => {
    const usuario = userEvent.setup();
    montar();
    await screen.findByRole('option', { name: 'Veredas' });
    await screen.findByRole('option', { name: 'Villa Ceferino' });

    await usuario.selectOptions(screen.getByLabelText('Área'), 'Veredas');
    await usuario.selectOptions(screen.getByLabelText('Barrio (opcional)'), 'Villa Ceferino');
    historial = [nuevo, anterior];
    await usuario.click(generar());

    expect(
      await screen.findByRole('heading', { name: 'Informe del 01/11/2026 al 23/11/2026' }),
    ).toBeInTheDocument();
    expect(pedidos).toEqual([{ ...periodoInicial(), areaId: 2, barrio: 'Villa Ceferino' }]);
    expect(ubicacion()).toBe('/indicadores?informe=4');
    expect(screen.getByRole('heading', { name: 'Estado general' })).toBeInTheDocument();
    expect(screen.getByText('Quedan 12 incidentes abiertos.')).toBeInTheDocument();
    expect(
      screen.getByText('2. Incidente #12: Luminaria apagada. Está cerca de una escuela.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Todo el organismo · Todos los barrios · pedido por Operador de Bacheo el 23/11/2026, 14:05',
      ),
    ).toBeInTheDocument();
    // El historial se vuelve a pedir y trae el nuevo.
    expect(
      await screen.findByRole('button', { name: 'Ver el informe del 01/11/2026 al 23/11/2026' }),
    ).toBeInTheDocument();
  });

  it('mientras la IA escribe, avisa y no deja volver a enviar', async () => {
    const usuario = userEvent.setup();
    let terminar!: () => void;
    respuestas = [
      () =>
        new Promise((resolver) => {
          terminar = () => resolver(HttpResponse.json({ informe: nuevo }, { status: 201 }));
        }),
    ];
    montar();

    await usuario.click(generar());

    expect(await screen.findByRole('status')).toHaveTextContent('La IA está escribiendo el informe');
    expect(screen.getByRole('button', { name: 'Generando…' })).toBeDisabled();
    expect(screen.getByLabelText('Barrio (opcional)')).toBeDisabled();
    terminar();
    expect(await screen.findByRole('heading', { name: /^Informe del/ })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('con la IA caída muestra el mensaje y se puede reintentar el mismo pedido', async () => {
    const usuario = userEvent.setup();
    respuestas = [() => HttpResponse.json(IA_CAIDA, { status: 503 })];
    montar();

    await usuario.click(generar());

    expect(await screen.findByText(/la IA no está disponible en este momento/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Informe del/ })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: /^Informe del/ })).toBeInTheDocument();
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1]).toEqual(pedidos[0]);
    expect(screen.queryByText(/la IA no está disponible/)).not.toBeInTheDocument();
  });

  it('con un período inválido no deja pedir el informe', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.clear(screen.getByLabelText('Desde'));
    await usuario.type(screen.getByLabelText('Desde'), '2026-12-01');
    await usuario.clear(screen.getByLabelText('Hasta'));
    await usuario.type(screen.getByLabelText('Hasta'), '2026-11-01');

    expect(await screen.findByText('No puede ser anterior a desde')).toBeInTheDocument();
    expect(generar()).toBeDisabled();
    expect(screen.getByText('Corregí el período de arriba para pedir un informe.')).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it('un error del servidor sobre un campo aparece en ese campo, sin botón de reintentar', async () => {
    const usuario = userEvent.setup();
    respuestas = [
      () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'areaId', mensaje: 'No es un área de tu organismo' }],
            },
          },
          { status: 400 },
        ),
    ];
    montar();

    await usuario.click(generar());

    expect(await screen.findByText('No es un área de tu organismo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('el historial muestra quién pidió cada informe y cuándo, y abre el elegido', async () => {
    const usuario = userEvent.setup();
    montar();

    const fila = (
      await screen.findByRole('button', { name: 'Ver el informe del 01/10/2026 al 31/10/2026' })
    ).closest('tr')!;
    expect(within(fila).getByText('Olga Ruiz')).toBeInTheDocument();
    expect(within(fila).getByText('02/11/2026, 09:30')).toBeInTheDocument();
    expect(within(fila).getByText('Veredas')).toBeInTheDocument();
    expect(within(fila).getByText(/Centro/)).toBeInTheDocument();

    await usuario.click(within(fila).getByRole('button', { name: /^Ver/ }));

    expect(ubicacion()).toBe('/indicadores?informe=3');
    expect(await screen.findByText('Las veredas tardan más.')).toBeInTheDocument();
    expect(fila).toHaveAttribute('aria-current', 'true');
  });

  it('sin informes anteriores lo dice', async () => {
    historial = [];
    montar();

    expect(
      await screen.findByText('Todavía no se pidió ningún informe en tu organismo.'),
    ).toBeInTheDocument();
  });

  it('un informe que no existe muestra el error', async () => {
    montar('/indicadores?informe=99');

    expect(await screen.findByText('No existe el informe')).toBeInTheDocument();
  });

  it('descarga el PDF con el período en el nombre', async () => {
    const usuario = userEvent.setup();
    const nombres: string[] = [];
    URL.createObjectURL = vi.fn(() => 'blob:informe');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      nombres.push(this.download);
    });
    montar('/indicadores?informe=3');

    await usuario.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

    await waitFor(() => expect(nombres).toEqual(['informe-2026-10-01-al-2026-10-31.pdf']));
    expect(pdfsPedidos).toEqual(['3']);
  });
});

describe('panel de indicadores', () => {
  it('muestra los números del período, cada gráfico con su título y sus datos en una tabla', async () => {
    const usuario = userEvent.setup();
    montar();

    expect((await screen.findByText('Abiertos', { selector: 'dt' })).nextElementSibling).toHaveTextContent(
      '7',
    );
    expect(screen.getByText('Nuevos', { selector: 'dt' }).nextElementSibling).toHaveTextContent('8');
    expect(screen.getByText('Resueltos', { selector: 'dt' }).nextElementSibling).toHaveTextContent('3');
    expect(screen.getByText('15 %')).toBeInTheDocument();
    expect(screen.getByText('3 de 20 reportes recibidos')).toBeInTheDocument();
    const { desde, hasta } = periodoInicial();
    expect(consultas).toEqual([`?desde=${desde}&hasta=${hasta}`]);

    const estados = screen.getByRole('region', { name: 'Abiertos por estado' });
    await usuario.click(within(estados).getByText('Ver los datos'));
    const tabla = within(estados).getByRole('table', { name: 'Abiertos por estado' });
    expect(within(tabla).getByRole('row', { name: 'En revisión 4' })).toBeInTheDocument();

    const semanas = screen.getByRole('region', { name: 'Nuevos y resueltos por semana' });
    expect(within(semanas).getByText('Incidentes por semana, de lunes a domingo')).toBeInTheDocument();
    expect(within(semanas).getByRole('row', { name: '02/11 5 1', hidden: true })).toBeInTheDocument();
  });

  it('al elegir un área, vuelve a pedir los indicadores de esa área', async () => {
    const usuario = userEvent.setup();
    montar();
    await screen.findByRole('option', { name: 'Veredas' });

    await usuario.selectOptions(screen.getByLabelText('Área'), 'Veredas');

    await waitFor(() => expect(consultas.at(-1)).toContain('areaId=2'));
  });

  it('el tiempo de resolución se agrupa por área, por categoría o por barrio', async () => {
    const usuario = userEvent.setup();
    montar();
    const tiempo = await screen.findByRole('region', { name: 'Tiempo de resolución' });

    expect(
      within(tiempo).getByRole('row', { name: 'Bacheo 3 4 días 5,2 días', hidden: true }),
    ).toBeInTheDocument();
    await usuario.click(within(tiempo).getByRole('button', { name: 'Por categoría' }));

    expect(within(tiempo).getByRole('button', { name: 'Por categoría' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(tiempo).getByRole('row', { name: 'Pozo en la calzada 2 6,5 días 7 días', hidden: true }),
    ).toBeInTheDocument();
  });

  it('muestra el mapa de calor con los incidentes abiertos', async () => {
    montar();

    expect(await screen.findByTestId('mapa-calor')).toHaveTextContent('2');
    expect(screen.getByText('2 incidentes abiertos en el mapa.')).toBeInTheDocument();
  });

  it('sin datos en el período lo dice en lugar de mostrar gráficos vacíos', async () => {
    indicadores = VACIOS;
    montar();

    expect(await screen.findByText(/No hay datos en este período/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Abiertos por estado' })).not.toBeInTheDocument();
  });

  it('un gráfico sin datos propios muestra su mensaje', async () => {
    indicadores = { ...CON_DATOS, tiempoDeResolucion: { porCategoria: [], porArea: [], porBarrio: [] } };
    montar();

    const tiempo = await screen.findByRole('region', { name: 'Tiempo de resolución' });
    expect(within(tiempo).getByText('No se resolvió ningún incidente en el período.')).toBeInTheDocument();
  });
});
