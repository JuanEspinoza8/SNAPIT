import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaInformes } from '../src/funcionalidades/informes/paginaInformes.js';
import { periodoInicial } from '../src/funcionalidades/informes/formato.js';
import type { Informe, ResumenInforme } from '../src/funcionalidades/informes/tipos.js';
import { renderConSesion } from './apoyo.js';

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
  historial = [anterior];
  respuestas = [];
  pdfsPedidos = [];
});
afterEach(() => {
  servidor.resetHandlers();
  vi.restoreAllMocks();
});

const montar = (entrada = '/informes') => renderConSesion(entrada, { '/informes': <PaginaInformes /> });
const ubicacion = () => screen.getByTestId('ubicacion').textContent;
const generar = () => screen.getByRole('button', { name: 'Generar informe' });

describe('informes', () => {
  it('genera un informe con el período, el área y el barrio, y lo muestra por secciones', async () => {
    const usuario = userEvent.setup();
    montar();
    await screen.findByRole('option', { name: 'Veredas' });
    await screen.findByRole('option', { name: 'Villa Ceferino' });

    await usuario.selectOptions(screen.getByLabelText('Área'), 'Veredas');
    await usuario.selectOptions(screen.getByLabelText('Barrio'), 'Villa Ceferino');
    historial = [nuevo, anterior];
    await usuario.click(generar());

    expect(
      await screen.findByRole('heading', { name: 'Informe del 01/11/2026 al 23/11/2026' }),
    ).toBeInTheDocument();
    expect(pedidos).toEqual([{ ...periodoInicial(), areaId: 2, barrio: 'Villa Ceferino' }]);
    expect(ubicacion()).toBe('/informes?id=4');
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
    expect(screen.getByLabelText('Desde')).toBeDisabled();
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

  it('un período inválido se marca sin llamar al servidor', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.clear(screen.getByLabelText('Desde'));
    await usuario.type(screen.getByLabelText('Desde'), '2026-12-01');
    await usuario.clear(screen.getByLabelText('Hasta'));
    await usuario.type(screen.getByLabelText('Hasta'), '2026-11-01');
    await usuario.click(generar());

    expect(await screen.findByText('No puede ser anterior a desde')).toBeInTheDocument();
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

    expect(ubicacion()).toBe('/informes?id=3');
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
    montar('/informes?id=99');

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
    montar('/informes?id=3');

    await usuario.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

    await waitFor(() => expect(nombres).toEqual(['informe-2026-10-01-al-2026-10-31.pdf']));
    expect(pdfsPedidos).toEqual(['3']);
  });
});
