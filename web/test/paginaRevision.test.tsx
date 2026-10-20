import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaRevision } from '../src/funcionalidades/revision/paginaRevision.js';
import type {
  EventoCola,
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
  propuestaIa: null,
  ...parcial,
});

const pozo = () =>
  pendiente({
    id: 15,
    registradoEn: '2026-10-17T09:10:00.000Z',
    categoria: { id: 1, nombre: 'Pozo en la calzada' },
  });

// Lo que tiene el "servidor": la lista, cada decisión que llegó y el procesamiento con IA.
let pendientes: ReportePendiente[] = [];
let decisiones: { id: number; cuerpo: unknown }[] = [];
let respuestaRevision: () => Response;
let eventosIa: EventoCola[] = [];
let delOrganismo: ReporteDelOrganismo[] = [];

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
  http.get('*/api/reportes', () => HttpResponse.json({ reportes: delOrganismo })),
  http.post('*/api/reportes/:id/revision', async ({ params, request }) => {
    const id = Number(params.id);
    decisiones.push({ id, cuerpo: await request.json() });
    const respuesta = respuestaRevision();
    if (respuesta.ok) pendientes = pendientes.filter((reporte) => reporte.id !== id);
    return respuesta;
  }),
  http.get('*/api/ia/procesos', () => HttpResponse.json({ procesos: [] })),
  http.post('*/api/ia/procesar-cola', () => {
    // La IA publica los que coinciden: dejan de estar pendientes.
    const publicados = eventosIa.filter((e) => e.estado === 'PUBLICADO').map((e) => e.reporte.id);
    pendientes = pendientes.filter((reporte) => !publicados.includes(reporte.id));
    return HttpResponse.json({ procesoId: 'p1', total: 2 }, { status: 202 });
  }),
  http.get('*/api/ia/procesos/p1', () =>
    HttpResponse.json({
      id: 'p1',
      enCurso: false,
      iniciadoEn: '2026-10-20T16:00:00.000Z',
      eventos: eventosIa,
      resumen: {
        total: 2,
        procesados: 2,
        publicados: 1,
        derivados: 1,
        errores: 0,
        tiempoMedioMs: 3000,
        costoUsd: 0.0004,
      },
    }),
  ),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  decisiones = [];
  eventosIa = [];
  delOrganismo = [];
});
beforeEach(() => {
  localStorage.setItem('snapit:tokenAcceso', 'acceso-del-operador');
  pendientes = [pendiente({}), pozo()];
  respuestaRevision = () =>
    HttpResponse.json({
      id: 12,
      estadoVerificacion: 'VERIFICADO',
      incidente: { id: 9, estado: 'VERIFICADO' },
      vecino: { reputacion: 66.67 },
    });
});

const abrir = () => renderRuta('/revision', <PaginaRevision />);
const fila = async (texto: string) => (await screen.findByText(texto)).closest('li') as HTMLElement;

async function abrirDetalle(usuario: ReturnType<typeof userEvent.setup>, texto = '#12 · Cordón sin rampa') {
  await usuario.click(within(await fila(texto)).getByRole('button', { name: /Revisar/ }));
  return screen.getByRole('dialog', { name: /Revisar el reporte/ });
}

describe('revisión de reportes de baja confianza', () => {
  it('lista los pendientes con su categoría, gravedad, confianza y estado', async () => {
    abrir();

    const primera = await fila('#12 · Cordón sin rampa');
    expect(within(primera).getByText(/Moderada · confianza 40/)).toBeInTheDocument();
    expect(within(primera).getByText('Pendiente')).toBeInTheDocument();
    expect(await fila('#15 · Pozo en la calzada')).toBeInTheDocument();
  });

  it('el detalle muestra las señales en texto claro, el vecino y el punto en el mapa', async () => {
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

    const detalle = await abrirDetalle(usuario);

    expect(
      within(detalle).getByText('La foto se eligió de la galería y no trae la ubicación donde se sacó'),
    ).toBeInTheDocument();
    expect(within(detalle).getByText('Foto repetida')).toBeInTheDocument();
    expect(within(detalle).getByText('-40')).toBeInTheDocument();
    expect(within(detalle).getByText(/Reputación/)).toHaveTextContent('Reputación 50 de 100');
    expect(within(detalle).getByTestId('mapa-chico')).toHaveTextContent('-38.9531,-68.0478');
  });

  it('si la IA ya lo derivó, el detalle dice qué propuso y por qué no coincide', async () => {
    const usuario = userEvent.setup();
    pendientes = [
      pendiente({
        propuestaIa: {
          categoriaId: 2,
          severidad: 'LEVE',
          explicacion: 'Se ven baldosas rotas',
          creadoEn: '',
        },
      }),
    ];
    abrir();

    const detalle = await abrirDetalle(usuario);

    expect(await within(detalle).findByText('Vereda rota · Leve')).toBeInTheDocument();
    expect(within(detalle).getByText(/No coincide con el vecino/)).toBeInTheDocument();
    expect(within(detalle).getByText('Se ven baldosas rotas')).toBeInTheDocument();
  });

  it('aprobar manda la decisión con el comentario; la fila queda como aprobada hasta limpiar', async () => {
    const usuario = userEvent.setup();
    abrir();

    const detalle = await abrirDetalle(usuario);
    await usuario.type(within(detalle).getByLabelText(/Comentario/), 'Se ve bien la rampa rota');
    await usuario.click(within(detalle).getByRole('button', { name: 'Aprobar y publicar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(decisiones).toEqual([
      { id: 12, cuerpo: { decision: 'VERIFICADO', comentario: 'Se ve bien la rampa rota' } },
    ]);
    expect(within(await fila('#12 · Cordón sin rampa')).getByText('Aprobado a mano')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /Limpiar resueltos/ }));

    expect(screen.queryByText('#12 · Cordón sin rampa')).not.toBeInTheDocument();
    expect(screen.getByText('#15 · Pozo en la calzada')).toBeInTheDocument();
  });

  it('desestimar pide confirmación; cancelar no manda nada', async () => {
    const usuario = userEvent.setup();
    abrir();

    const detalle = await abrirDetalle(usuario);
    await usuario.click(within(detalle).getByRole('button', { name: 'Desestimar' }));
    expect(within(detalle).getByText(/¿Desestimar este reporte\?/)).toBeInTheDocument();
    await usuario.click(within(detalle).getByRole('button', { name: 'Cancelar' }));
    expect(decisiones).toEqual([]);

    await usuario.click(within(detalle).getByRole('button', { name: 'Desestimar' }));
    await usuario.click(within(detalle).getByRole('button', { name: 'Sí, desestimar' }));

    await waitFor(() => expect(decisiones).toEqual([{ id: 12, cuerpo: { decision: 'DESESTIMADO' } }]));
    expect(within(await fila('#12 · Cordón sin rampa')).getByText('Desestimado')).toBeInTheDocument();
  });

  it('un error al decidir se muestra en el detalle, sin perder el comentario', async () => {
    const usuario = userEvent.setup();
    respuestaRevision = () =>
      HttpResponse.json(
        { error: { codigo: 'SIN_PERMISO', mensaje: 'El reporte es de un incidente de otro organismo' } },
        { status: 403 },
      );
    abrir();

    const detalle = await abrirDetalle(usuario);
    await usuario.type(within(detalle).getByLabelText(/Comentario/), 'Revisado');
    await usuario.click(within(detalle).getByRole('button', { name: 'Aprobar y publicar' }));

    expect(
      await within(detalle).findByText('El reporte es de un incidente de otro organismo'),
    ).toBeInTheDocument();
    expect(within(detalle).getByLabelText(/Comentario/)).toHaveValue('Revisado');
  });

  it('si otro operador ya lo revisó, avisa y la fila queda como resuelta', async () => {
    const usuario = userEvent.setup();
    respuestaRevision = () =>
      HttpResponse.json(
        { error: { codigo: 'REPORTE_YA_REVISADO', mensaje: 'El reporte ya fue revisado' } },
        { status: 409 },
      );
    abrir();

    const detalle = await abrirDetalle(usuario);
    pendientes = pendientes.filter((reporte) => reporte.id !== 12); // lo resolvió otro operador
    await usuario.click(within(detalle).getByRole('button', { name: 'Aprobar y publicar' }));

    expect(await within(detalle).findByText('El reporte ya fue revisado')).toBeInTheDocument();
    await usuario.click(within(detalle).getByRole('button', { name: 'Cerrar' }));
    expect(within(await fila('#12 · Cordón sin rampa')).getByText('Resuelto')).toBeInTheDocument();
  });

  it('procesar con IA actualiza cada fila en el lugar: publicados y derivados', async () => {
    const usuario = userEvent.setup();
    const reporteDe = (r: ReportePendiente) => ({
      id: r.id,
      categoria: r.categoria,
      severidadDeclarada: r.severidadDeclarada,
      foto: null,
      incidenteId: r.incidente?.id ?? null,
    });
    const [rampa, calle] = pendientes;
    let id = 0;
    const evento = (
      r: ReportePendiente,
      estado: EventoCola['estado'],
      propuesta: EventoCola['propuesta'] = null,
    ) => ({
      id: ++id,
      creadoEn: '2026-10-20T16:00:05.000Z',
      estado,
      detalle: estado === 'REVISION_MANUAL' ? 'No coincide con lo que eligió el vecino' : null,
      reporte: reporteDe(r!),
      propuesta,
    });
    eventosIa = [
      evento(rampa!, 'EN_PROCESO'),
      evento(rampa!, 'CLASIFICADO', {
        registroIaId: 1,
        categoriaId: 3,
        severidad: 'MODERADA',
        explicacion: 'Se ve una rampa rota',
      }),
      evento(rampa!, 'PUBLICADO'),
      evento(calle!, 'EN_PROCESO'),
      evento(calle!, 'CLASIFICADO', {
        registroIaId: 2,
        categoriaId: 2,
        severidad: 'LEVE',
        explicacion: 'Parece una vereda',
      }),
      evento(calle!, 'REVISION_MANUAL'),
    ];
    abrir();
    await fila('#12 · Cordón sin rampa');

    await usuario.click(screen.getByRole('button', { name: /Procesar con IA/ }));

    const publicada = await fila('#12 · Cordón sin rampa');
    expect(await within(publicada).findByText('Publicado por la IA')).toBeInTheDocument();
    expect(within(publicada).getByText('✓ coincide')).toBeInTheDocument();
    const derivada = await fila('#15 · Pozo en la calzada');
    expect(within(derivada).getByText('Para revisión manual')).toBeInTheDocument();
    expect(within(derivada).getByText('≠ no coincide')).toBeInTheDocument();
    expect(within(derivada).getByRole('button', { name: /Revisar/ })).toBeInTheDocument();

    // Limpiar saca el publicado; el derivado sigue esperando a una persona.
    await usuario.click(screen.getByRole('button', { name: /Limpiar resueltos/ }));
    expect(screen.queryByText('#12 · Cordón sin rampa')).not.toBeInTheDocument();
    expect(screen.getByText('#15 · Pozo en la calzada')).toBeInTheDocument();
  });

  it('sin pendientes, lo dice', async () => {
    pendientes = [];
    abrir();

    expect(await screen.findByText('No hay reportes esperando aprobación.')).toBeInTheDocument();
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

describe('todos los reportes', () => {
  const conEstado = (
    parcial: Partial<ReportePendiente>,
    estadoVerificacion: ReporteDelOrganismo['estadoVerificacion'],
    publicadoPorIaEn: string | null = null,
  ): ReporteDelOrganismo => ({ ...pendiente(parcial), estadoVerificacion, publicadoPorIaEn });

  beforeEach(() => {
    delOrganismo = [
      conEstado(
        { id: 30, categoria: { id: 1, nombre: 'Pozo en la calzada' } },
        'VERIFICADO',
        '2026-10-20T16:05:00.000Z',
      ),
      conEstado({ id: 29, categoria: { id: 3, nombre: 'Cordón sin rampa' } }, 'VERIFICADO'),
      conEstado({ id: 28, categoria: { id: 2, nombre: 'Vereda rota' } }, 'DESESTIMADO'),
      conEstado({ id: 12 }, 'PENDIENTE_REVISION'),
    ];
  });

  const abrirTodos = async (usuario: ReturnType<typeof userEvent.setup>) => {
    abrir();
    await usuario.click(await screen.findByRole('button', { name: /Todos los reportes/ }));
  };

  it('se abre desde el menú lateral y muestra cada reporte con su estado', async () => {
    const usuario = userEvent.setup();
    await abrirTodos(usuario);

    expect(
      within(await fila('#30 · Pozo en la calzada')).getByText('Publicado por la IA'),
    ).toBeInTheDocument();
    expect(within(await fila('#29 · Cordón sin rampa')).getByText('Publicado')).toBeInTheDocument();
    expect(within(await fila('#28 · Vereda rota')).getByText('Desestimado')).toBeInTheDocument();
    expect(within(await fila('#12 · Cordón sin rampa')).getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Todos los reportes/ })).toHaveTextContent('4');
  });

  it('filtra por estado y por categoría, con la cantidad de cada estado', async () => {
    const usuario = userEvent.setup();
    await abrirTodos(usuario);
    await fila('#30 · Pozo en la calzada');

    expect(screen.getByRole('tab', { name: /Publicados/ })).toHaveTextContent('(2)');
    await usuario.click(screen.getByRole('tab', { name: /Publicados/ }));
    expect(screen.getByText('#30 · Pozo en la calzada')).toBeInTheDocument();
    expect(screen.queryByText('#28 · Vereda rota')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('tab', { name: /Todos/ }));
    await usuario.selectOptions(screen.getByRole('combobox', { name: /Categoría/ }), 'Vereda rota');
    expect(screen.getByText('#28 · Vereda rota')).toBeInTheDocument();
    expect(screen.queryByText('#30 · Pozo en la calzada')).not.toBeInTheDocument();
  });

  it('un reporte ya decidido se abre para consultarlo, sin decisión', async () => {
    const usuario = userEvent.setup();
    await abrirTodos(usuario);

    await usuario.click(await screen.findByText('#30 · Pozo en la calzada'));

    const detalle = screen.getByRole('dialog', { name: 'Reporte #30' });
    expect(within(detalle).getByText(/Lo publicó la IA el/)).toBeInTheDocument();
    expect(within(detalle).getByRole('button', { name: /Ver el incidente/ })).toBeInTheDocument();
    expect(within(detalle).queryByRole('button', { name: 'Aprobar y publicar' })).not.toBeInTheDocument();
  });

  it('un pendiente se abre para decidir', async () => {
    const usuario = userEvent.setup();
    await abrirTodos(usuario);

    await usuario.click(await screen.findByText('#12 · Cordón sin rampa'));

    const detalle = screen.getByRole('dialog', { name: 'Revisar el reporte #12' });
    expect(within(detalle).getByRole('button', { name: 'Aprobar y publicar' })).toBeInTheDocument();
  });
});
