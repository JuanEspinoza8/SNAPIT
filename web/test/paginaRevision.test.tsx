import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaRevision } from '../src/funcionalidades/revision/paginaRevision.js';
import type {
  EventoCola,
  ProcesoCola,
  ReporteDelOrganismo,
  ReportePendiente,
} from '../src/funcionalidades/revision/tipos.js';
import { renderRuta } from './apoyo.js';

// Leaflet no funciona en jsdom: el mapa chico se reemplaza por una marca con el punto.
vi.mock('../src/funcionalidades/revision/MapaChico.js', () => ({
  MapaChico: ({ lat, lon }: { lat: number; lon: number }) => (
    <div data-testid="mapa-chico">
      {lat},{lon}
    </div>
  ),
}));

const pendiente = (parcial: Partial<ReportePendiente> = {}): ReportePendiente => ({
  id: 12,
  registradoEn: '2026-10-16T14:20:00.000Z',
  categoria: { id: 3, nombre: 'Cordón sin rampa' },
  severidadDeclarada: 'MODERADA',
  descripcion: 'Rampa rota en el acceso de la escuela.',
  direccion: 'General Villegas 195, Villa Farrel',
  lat: -38.9531,
  lon: -68.0478,
  origen: 'SITIO_WEB',
  nivelConfianza: 67,
  senales: [
    { tipo: 'EXIF_COINCIDE', valor: 1, detalle: 'La foto se sacó a 12 m del punto reportado (máximo 100 m)' },
    { tipo: 'FECHA_ANTIGUA', valor: 0, detalle: 'La foto no trae la fecha en que se sacó' },
    { tipo: 'HASH_DUPLICADO', valor: -1, detalle: 'La misma foto ya se usó en el reporte 3, de otro vecino' },
  ],
  fotos: [],
  incidente: { id: 9, estado: 'REGISTRADO', cantidadReportes: 1 },
  vecino: { reputacion: 50, reportesConfirmados: 2, reportesDesestimados: 1 },
  propuestaIa: null,
  ...parcial,
});

const pozo = () =>
  pendiente({
    id: 15,
    registradoEn: '2026-10-17T09:10:00.000Z',
    categoria: { id: 1, nombre: 'Pozo en la calzada' },
  });

const perro = () =>
  pendiente({
    id: 18,
    registradoEn: '2026-10-18T09:10:00.000Z',
    categoria: { id: 1, nombre: 'Pozo en la calzada' },
    propuestaIa: {
      categoriaId: null,
      severidad: null,
      explicacion: 'Es un perro en un patio.',
      creadoEn: '2026-10-18T10:00:00.000Z',
      datosPersonales: false,
      mismoProblema: null,
      esProblemaViaPublica: false,
    },
  });

const delOrganismo = (
  r: ReportePendiente,
  extra: Partial<ReporteDelOrganismo> = {},
): ReporteDelOrganismo => ({
  ...r,
  estadoVerificacion: 'PENDIENTE_REVISION',
  publicadoPorIaEn: null,
  marcadoParaDesestimar: false,
  ...extra,
});

// Lo que tiene el "servidor".
let pendientes: ReportePendiente[] = [];
let desestimados: ReportePendiente[] = [];
let todos: ReporteDelOrganismo[] = [];
let decisiones: { id: number; cuerpo: unknown }[] = [];
let confirmaciones: unknown[] = [];
let respuestaRevision: () => Response;
let proceso: ProcesoCola | null = null;
let alProcesar: () => void = () => {};

const servidor = setupServer(
  http.get('*/api/categorias', () =>
    HttpResponse.json({
      categorias: [
        { id: 1, nombre: 'Pozo en la calzada' },
        { id: 2, nombre: 'Vereda rota' },
        { id: 3, nombre: 'Cordón sin rampa' },
      ],
    }),
  ),
  http.get('*/api/reportes/pendientes', () => HttpResponse.json({ reportes: pendientes })),
  http.get('*/api/reportes/desestimados-pendientes', () => HttpResponse.json({ reportes: desestimados })),
  // Como el servidor: desestima los de `ids` que siguen marcados y omite los demás, con el motivo.
  http.post('*/api/reportes/desestimados-pendientes/confirmacion', async ({ request }) => {
    const cuerpo = (await request.json()) as { ids?: number[] };
    confirmaciones.push(cuerpo);
    const marcados = new Set(desestimados.map((r) => r.id));
    const pedidos = cuerpo.ids ?? [...marcados];
    desestimados = desestimados.filter((r) => !pedidos.includes(r.id));
    return HttpResponse.json({
      desestimados: pedidos.filter((id) => marcados.has(id)),
      omitidos: pedidos
        .filter((id) => !marcados.has(id))
        .map((id) => ({ id, motivo: 'Ya no está marcado para desestimar' })),
    });
  }),
  http.get('*/api/reportes', () => HttpResponse.json({ reportes: todos })),
  http.post('*/api/reportes/:id/revision', async ({ params, request }) => {
    const id = Number(params.id);
    decisiones.push({ id, cuerpo: await request.json() });
    const respuesta = respuestaRevision();
    if (respuesta.ok) {
      pendientes = pendientes.filter((r) => r.id !== id);
      desestimados = desestimados.filter((r) => r.id !== id);
    }
    return respuesta;
  }),
  http.get('*/api/ia/procesos', () =>
    HttpResponse.json({ procesos: proceso ? [{ id: proceso.id, enCurso: proceso.enCurso }] : [] }),
  ),
  http.post('*/api/ia/procesar-cola', () => {
    alProcesar();
    return HttpResponse.json({ procesoId: 'p1', total: 3 }, { status: 202 });
  }),
  http.get('*/api/ia/procesos/p1', () => HttpResponse.json(proceso)),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());
beforeEach(() => {
  localStorage.setItem('snapit:tokenAcceso', 'acceso-del-operador');
  pendientes = [pendiente(), pozo()];
  desestimados = [];
  todos = [];
  decisiones = [];
  confirmaciones = [];
  proceso = null;
  alProcesar = () => {};
  respuestaRevision = () =>
    HttpResponse.json({
      id: 12,
      estadoVerificacion: 'VERIFICADO',
      incidente: { id: 9, estado: 'VERIFICADO' },
      vecino: { reputacion: 66.67 },
    });
});

const abrir = () => renderRuta('/revision', <PaginaRevision />);
const fila = async (id: number) =>
  (await screen.findByText(new RegExp(`^#${id} ·`))).closest('li') as HTMLElement;

async function abrirDetalle(usuario: ReturnType<typeof userEvent.setup>, id = 12) {
  await usuario.click(within(await fila(id)).getByRole('button', { name: `Revisar el reporte #${id}` }));
  return screen.getByRole('dialog', { name: `Reporte #${id}` });
}

const irA = async (usuario: ReturnType<typeof userEvent.setup>, pestania: RegExp) =>
  usuario.click(await screen.findByRole('button', { name: pestania }));

describe('pendientes', () => {
  it('lista los pendientes con su categoría y gravedad, y cada pestaña con su cantidad', async () => {
    desestimados = [perro()];
    abrir();

    expect(within(await fila(12)).getByText('Cordón sin rampa · Moderada')).toBeInTheDocument();
    expect(await fila(15)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pendientes/ })).toHaveTextContent('2'));
    expect(screen.getByRole('button', { name: /Desestimados por la IA/ })).toHaveTextContent('1');
  });

  it('el detalle muestra los controles, lo que vio la IA, el vecino y el punto en el mapa', async () => {
    const usuario = userEvent.setup();
    pendientes = [
      pendiente({
        propuestaIa: {
          categoriaId: 2,
          severidad: 'LEVE',
          explicacion: 'Se ve una baldosa rota.',
          creadoEn: '2026-10-16T15:00:00.000Z',
          datosPersonales: false,
          mismoProblema: null,
          esProblemaViaPublica: true,
        },
      }),
    ];
    abrir();

    const detalle = await abrirDetalle(usuario);

    // Cada control dice en palabras si se cumple: el color solo acompaña.
    const control = (nombre: string) => within(detalle).getByText(nombre).closest('li')!;
    expect(control('Ubicación de la foto')).toHaveTextContent('Se cumple');
    expect(control('Antigüedad')).toHaveTextContent('Sin dato');
    expect(control('Foto repetida')).toHaveTextContent('No se cumple');
    expect(within(detalle).getByText(/de otro vecino/)).toBeInTheDocument();
    expect(within(detalle).getByText('Vereda rota')).toBeInTheDocument();
    expect(within(detalle).getByText(/no coincide con el vecino/)).toBeInTheDocument();
    expect(within(detalle).getByText('Se ve una baldosa rota.')).toBeInTheDocument();
    expect(within(detalle).getByText('2 reportes publicados · 1 desestimado')).toBeInTheDocument();
    expect(within(detalle).getByTestId('mapa-chico')).toHaveTextContent('-38.9531,-68.0478');
  });

  it('si la IA vio una cara o una patente, el detalle lo avisa antes de publicar', async () => {
    const usuario = userEvent.setup();
    const propuesta = {
      categoriaId: 3,
      severidad: 'MODERADA' as const,
      explicacion: 'Se ve la rampa rota y un auto estacionado.',
      creadoEn: '2026-10-16T15:00:00.000Z',
      mismoProblema: null,
      esProblemaViaPublica: true,
    };
    pendientes = [
      pendiente({ propuestaIa: { ...propuesta, datosPersonales: true } }),
      pozo(),
      pendiente({ id: 21, propuestaIa: { ...propuesta, datosPersonales: null } }),
    ];
    abrir();

    const detalle = await abrirDetalle(usuario);
    expect(within(detalle).getByRole('note')).toHaveTextContent(
      'Se ve una cara o una patente: mirá la foto antes de publicarla.',
    );
    await usuario.keyboard('{Escape}');

    // Si no lo informó (null) o no se ve nada, no hay aviso.
    expect(within(await abrirDetalle(usuario, 21)).queryByRole('note')).not.toBeInTheDocument();
  });

  it('publicar manda la decisión con el comentario, cierra el detalle y lo saca de la lista', async () => {
    const usuario = userEvent.setup();
    abrir();
    const detalle = await abrirDetalle(usuario);

    await usuario.type(within(detalle).getByLabelText(/Comentario/), 'Se ve bien');
    await usuario.click(within(detalle).getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(decisiones).toEqual([{ id: 12, cuerpo: { decision: 'VERIFICADO', comentario: 'Se ve bien' } }]);
    await waitFor(() => expect(screen.queryByText(/^#12 ·/)).not.toBeInTheDocument());
  });

  it('desestimar pide confirmación; cancelar no manda nada', async () => {
    const usuario = userEvent.setup();
    abrir();
    const detalle = await abrirDetalle(usuario);

    await usuario.click(within(detalle).getByRole('button', { name: 'Desestimar' }));
    expect(within(detalle).getByText(/La reputación del vecino va a bajar/)).toBeInTheDocument();
    expect(within(detalle).getByRole('button', { name: 'Sí, desestimar' })).toHaveFocus();
    await usuario.click(within(detalle).getByRole('button', { name: 'Cancelar' }));
    expect(decisiones).toEqual([]);
    expect(within(detalle).getByRole('button', { name: 'Desestimar' })).toHaveFocus();

    await usuario.click(within(detalle).getByRole('button', { name: 'Desestimar' }));
    await usuario.click(within(detalle).getByRole('button', { name: 'Sí, desestimar' }));
    await waitFor(() => expect(decisiones).toEqual([{ id: 12, cuerpo: { decision: 'DESESTIMADO' } }]));
  });

  it('un error al decidir se muestra en el detalle, sin cerrarlo', async () => {
    const usuario = userEvent.setup();
    respuestaRevision = () =>
      HttpResponse.json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Algo falló' } }, { status: 500 });
    abrir();
    const detalle = await abrirDetalle(usuario);

    await usuario.click(within(detalle).getByRole('button', { name: 'Publicar' }));

    expect(await within(detalle).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('si otro operador ya lo revisó, el detalle lo avisa y no deja decidir', async () => {
    const usuario = userEvent.setup();
    respuestaRevision = () => {
      pendientes = pendientes.filter((r) => r.id !== 12);
      return HttpResponse.json(
        { error: { codigo: 'REPORTE_YA_REVISADO', mensaje: 'El reporte ya fue revisado' } },
        { status: 409 },
      );
    };
    abrir();
    const detalle = await abrirDetalle(usuario);

    await usuario.click(within(detalle).getByRole('button', { name: 'Publicar' }));

    expect(await within(detalle).findByText(/lo decidió otra persona/)).toBeInTheDocument();
    expect(within(detalle).getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('sin pendientes, lo dice; si la lista falla, deja reintentar', async () => {
    pendientes = [];
    const { unmount } = abrir();
    expect(await screen.findByText('No hay reportes esperando revisión.')).toBeInTheDocument();
    unmount();

    servidor.use(
      http.get('*/api/reportes/pendientes', () =>
        HttpResponse.json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Falló' } }, { status: 500 }),
      ),
    );
    abrir();
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });
});

describe('procesar con IA', () => {
  // Arma el procesamiento que devuelve el servidor, con los pasos de cada reporte.
  let siguiente = 0;
  const paso = (
    r: ReportePendiente,
    estado: EventoCola['estado'],
    extra: Partial<EventoCola> = {},
  ): EventoCola => ({
    id: ++siguiente,
    creadoEn: '2026-10-20T16:00:00.000Z',
    estado,
    detalle: null,
    reporte: {
      id: r.id,
      categoria: r.categoria,
      severidadDeclarada: r.severidadDeclarada,
      foto: null,
      incidenteId: r.incidente?.id ?? null,
    },
    propuesta: null,
    ...extra,
  });
  const analisis = (esProblemaViaPublica: boolean): EventoCola['propuesta'] => ({
    registroIaId: 1,
    esProblemaViaPublica,
    categoriaId: esProblemaViaPublica ? 3 : null,
    severidad: esProblemaViaPublica ? 'MODERADA' : null,
    mismoProblema: null,
    datosPersonales: false,
    explicacion: esProblemaViaPublica ? 'Se ve una rampa rota.' : 'Es un perro en un patio.',
  });

  it('muestra en cada fila qué hizo la IA, con el motivo, y el resumen al terminar', async () => {
    const usuario = userEvent.setup();
    const [rampa, calle] = pendientes as [ReportePendiente, ReportePendiente];
    const tercero = pendiente({ id: 20, registradoEn: '2026-10-18T09:00:00.000Z' });
    pendientes = [rampa, calle, tercero];
    alProcesar = () => {
      proceso = {
        id: 'p1',
        enCurso: false,
        iniciadoEn: '2026-10-20T16:00:00.000Z',
        eventos: [
          paso(rampa, 'CLASIFICADO', { propuesta: analisis(true) }),
          paso(rampa, 'PUBLICADO', {
            detalle: 'Coincide con lo que eligió el vecino y la foto se sacó en el punto: publicado',
          }),
          paso(calle, 'CLASIFICADO', { propuesta: analisis(false) }),
          paso(calle, 'REVISION_MANUAL', { detalle: 'La foto no muestra un problema de la vía pública' }),
          paso(tercero, 'CLASIFICADO', { propuesta: analisis(true) }),
          paso(tercero, 'REVISION_MANUAL', { detalle: 'La foto se sacó lejos del punto reportado' }),
        ],
        resumen: {
          total: 3,
          procesados: 3,
          publicados: 1,
          publicadosConSugerencia: 0,
          derivados: 1,
          desestimados: 1,
          errores: 0,
          tiempoMedioMs: 3100,
          costoUsd: 0.0006,
        },
      };
      // Lo publicado sale de los pendientes; lo marcado pasa a desestimados.
      pendientes = [tercero];
      desestimados = [calle];
    };
    abrir();

    await usuario.click(await screen.findByRole('button', { name: 'Procesar con IA (3)' }));

    expect(await within(await fila(12)).findByText('Publicado')).toBeInTheDocument();
    const marcado = await fila(15);
    expect(within(marcado).getByText('Para desestimar')).toBeInTheDocument();
    expect(within(marcado).getByText('La foto no muestra un problema de la vía pública')).toBeInTheDocument();
    const aRevisar = await fila(20);
    expect(within(aRevisar).getByText('Para revisar')).toBeInTheDocument();
    expect(within(aRevisar).getByRole('button', { name: 'Revisar el reporte #20' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /3 reportes · 1 publicados · 1 para revisar · 1 para desestimar · 3,1 s por foto · US\$ 0,0006/,
    );

    // «Listo» saca de la vista lo que resolvió la IA.
    await usuario.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText(/^#12 ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^#15 ·/)).not.toBeInTheDocument();
    expect(await fila(20)).toBeInTheDocument();
  });

  it('el botón cuenta solo los que la IA todavía no miró', async () => {
    pendientes = [
      pendiente(),
      pozo(),
      pendiente({
        id: 21,
        propuestaIa: {
          categoriaId: 3,
          severidad: 'LEVE',
          explicacion: null,
          creadoEn: '2026-10-19T10:00:00.000Z',
          datosPersonales: null,
          mismoProblema: null,
          esProblemaViaPublica: true,
        },
      }),
    ];
    abrir();

    expect(await screen.findByRole('button', { name: 'Procesar con IA (2)' })).toBeEnabled();
  });

  it('si no se puede procesar, lo dice', async () => {
    const usuario = userEvent.setup();
    servidor.use(
      http.post('*/api/ia/procesar-cola', () =>
        HttpResponse.json(
          { error: { codigo: 'IA_NO_DISPONIBLE', mensaje: 'La IA no está disponible en este momento' } },
          { status: 503 },
        ),
      ),
    );
    abrir();

    await usuario.click(await screen.findByRole('button', { name: 'Procesar con IA (2)' }));

    expect(await screen.findByText(/La IA no está disponible/)).toBeInTheDocument();
  });
});

describe('desestimados por la IA', () => {
  it('lista los apartados con lo que vio la IA, y los desestima todos después de confirmar', async () => {
    const usuario = userEvent.setup();
    desestimados = [perro()];
    abrir();
    await irA(usuario, /Desestimados por la IA/);

    expect(within(await fila(18)).getByText('IA: Es un perro en un patio.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Desestimar todos (1)' }));
    expect(screen.getByText(/La reputación de sus vecinos va a bajar/)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Sí, desestimar' }));

    await waitFor(() => expect(confirmaciones).toEqual([{ ids: [18] }]));
    expect(await screen.findByText('No hay reportes apartados por la IA.')).toBeInTheDocument();
  });

  it('manda solo los que muestra la lista, no los que la IA marcó después', async () => {
    const usuario = userEvent.setup();
    desestimados = [perro()];
    abrir();
    await irA(usuario, /Desestimados por la IA/);
    await fila(18);
    // Mientras tanto, la IA marcó otro: el servidor lo tiene, pero la lista todavía no lo muestra.
    desestimados = [perro(), pendiente({ id: 25 })];

    await usuario.click(screen.getByRole('button', { name: 'Desestimar todos (1)' }));
    await usuario.click(screen.getByRole('button', { name: 'Sí, desestimar' }));

    await waitFor(() => expect(confirmaciones).toEqual([{ ids: [18] }]));
    expect(await fila(25)).toBeInTheDocument();
  });

  it('dice el motivo de cada uno que no se desestimó', async () => {
    const usuario = userEvent.setup();
    desestimados = [perro(), pendiente({ id: 25 })];
    abrir();
    await irA(usuario, /Desestimados por la IA/);
    await fila(25);
    // Otra persona rescató el 25 mientras tanto.
    desestimados = [perro()];

    await usuario.click(screen.getByRole('button', { name: 'Desestimar todos (2)' }));
    await usuario.click(screen.getByRole('button', { name: 'Sí, desestimar' }));

    expect(await screen.findByText('Uno no se desestimó:')).toBeInTheDocument();
    expect(screen.getByText('#25: Ya no está marcado para desestimar')).toBeInTheDocument();
    expect(confirmaciones).toEqual([{ ids: [18, 25] }]);
  });

  it('mientras la IA procesa no se puede desestimar todos', async () => {
    desestimados = [perro()];
    proceso = {
      id: 'p1',
      enCurso: true,
      iniciadoEn: '2026-10-20T16:00:00.000Z',
      eventos: [],
      resumen: {
        total: 1,
        procesados: 0,
        publicados: 0,
        publicadosConSugerencia: 0,
        derivados: 0,
        desestimados: 0,
        errores: 0,
        tiempoMedioMs: null,
        costoUsd: null,
      },
    };
    const usuario = userEvent.setup();
    abrir();
    await irA(usuario, /Desestimados por la IA/);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Desestimar todos (1)' })).toBeDisabled());
    expect(screen.getByText(/La IA está procesando/)).toBeInTheDocument();
  });

  it('al confirmar, el foco va a «Sí, desestimar», y al cancelar vuelve al botón', async () => {
    const usuario = userEvent.setup();
    desestimados = [perro()];
    abrir();
    await irA(usuario, /Desestimados por la IA/);
    await fila(18);

    await usuario.click(screen.getByRole('button', { name: 'Desestimar todos (1)' }));
    expect(screen.getByRole('button', { name: 'Sí, desestimar' })).toHaveFocus();
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Desestimar todos (1)' })).toHaveFocus();
    expect(confirmaciones).toEqual([]);
  });

  it('rescatar uno es publicarlo igual desde su detalle', async () => {
    const usuario = userEvent.setup();
    desestimados = [perro()];
    abrir();
    await irA(usuario, /Desestimados por la IA/);

    const detalle = await abrirDetalle(usuario, 18);
    expect(within(detalle).getByText('No muestra un problema de la vía pública.')).toBeInTheDocument();
    await usuario.click(within(detalle).getByRole('button', { name: 'Publicar igual' }));

    await waitFor(() => expect(decisiones).toEqual([{ id: 18, cuerpo: { decision: 'VERIFICADO' } }]));
  });
});

describe('todos los reportes', () => {
  beforeEach(() => {
    todos = [
      delOrganismo(pendiente({ id: 30 }), {
        estadoVerificacion: 'VERIFICADO',
        publicadoPorIaEn: '2026-10-20T16:00:00.000Z',
      }),
      delOrganismo(pendiente({ id: 29, categoria: { id: 2, nombre: 'Vereda rota' } }), {
        estadoVerificacion: 'DESESTIMADO',
      }),
      delOrganismo(perro(), { marcadoParaDesestimar: true }),
      delOrganismo(pendiente()),
    ];
    desestimados = [perro()];
  });

  it('muestra cada reporte con su estado y filtra por estado y categoría', async () => {
    const usuario = userEvent.setup();
    abrir();
    await irA(usuario, /^Todos$/);

    expect(within(await fila(30)).getByText('por la IA')).toBeInTheDocument();
    expect(within(await fila(29)).getByText('Desestimado')).toBeInTheDocument();
    expect(within(await fila(18)).getByText('Para desestimar')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /^Desestimados/, pressed: false }));
    expect(screen.queryByText(/^#30 ·/)).not.toBeInTheDocument();
    expect(await fila(29)).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /^Todos \d/ }));
    await usuario.selectOptions(screen.getByLabelText('Categoría'), '2');
    expect(screen.queryByText(/^#30 ·/)).not.toBeInTheDocument();
    expect(await fila(29)).toBeInTheDocument();
  });

  it('uno decidido se abre para consultar; uno pendiente, para decidir', async () => {
    const usuario = userEvent.setup();
    abrir();
    await irA(usuario, /^Todos$/);

    await usuario.click(within(await fila(30)).getByRole('button'));
    const consulta = screen.getByRole('dialog', { name: 'Reporte #30' });
    expect(within(consulta).getByText(/Lo publicó la IA el/)).toBeInTheDocument();
    expect(within(consulta).queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    await usuario.keyboard('{Escape}');

    await usuario.click(within(await fila(12)).getByRole('button'));
    expect(
      within(screen.getByRole('dialog', { name: 'Reporte #12' })).getByRole('button', { name: 'Publicar' }),
    ).toBeInTheDocument();
  });
});
