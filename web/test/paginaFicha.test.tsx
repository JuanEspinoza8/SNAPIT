import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaFicha } from '../src/funcionalidades/bandeja/paginaFicha.js';
import type {
  CierreGestion,
  FichaGestion,
  Movimiento,
  ResultadoCierre,
} from '../src/funcionalidades/bandeja/tipos.js';
import { renderConSesion } from './apoyo.js';

const operador = { id: 3, nombre: 'Operador de Bacheo' };

const categorias = [
  { id: 1, nombre: 'Pozo en la calzada', area: { id: 1, nombre: 'Bacheo' } },
  { id: 2, nombre: 'Vereda rota', area: { id: 2, nombre: 'Veredas' } },
];

function movimiento(id: number, datos: Partial<Movimiento>): Movimiento {
  return {
    id,
    tipo: 'COMENTARIO',
    usuario: operador,
    area: null,
    estadoAnterior: null,
    estadoNuevo: null,
    comentario: null,
    incidenteRelacionadoId: null,
    creadoEn: '2026-10-13T09:00:00.000Z',
    ...datos,
  };
}

function fichaBase(cambios: Partial<FichaGestion> = {}): FichaGestion {
  return {
    id: 7,
    estado: 'VERIFICADO',
    categoria: { id: 1, nombre: 'Pozo en la calzada' },
    area: { id: 1, nombre: 'Bacheo' },
    severidad: 'GRAVE',
    direccion: 'Lanín 120, Villa Ceferino',
    lat: -38.9516,
    lon: -68.0591,
    tipoVigencia: 'PERMANENTE',
    vigenteHasta: null,
    caducadoEn: null,
    primerReporteEn: '2026-10-12T14:20:00.000Z',
    resueltoEn: null,
    cantidadReportes: 2,
    incidentePrincipalId: null,
    unidos: [{ id: 14, estado: 'VERIFICADO' }],
    prioridad: {
      puntajePrioridad: 94.49,
      prioridadManual: null,
      motivoPrioridadManual: null,
      ajustadaPor: null,
      factores: [
        { factor: 'SEVERIDAD', valor: 60, detalle: 'Gravedad grave en Pozo en la calzada: +60' },
        { factor: 'CONTEXTO_URBANO', valor: 15, detalle: 'A 80 m de Escuela N° 123 (escuela): +15' },
      ],
    },
    reportes: [
      {
        id: 12,
        incidenteId: 7,
        registradoEn: '2026-10-12T14:20:00.000Z',
        categoria: { id: 1, nombre: 'Pozo en la calzada' },
        severidadDeclarada: 'GRAVE',
        descripcion: 'Pozo profundo',
        direccion: 'Lanín 120, Villa Ceferino',
        lat: -38.9516,
        lon: -68.0591,
        origen: 'APP_MOVIL',
        nivelConfianza: 65,
        estadoVerificacion: 'VERIFICADO',
        senales: [{ tipo: 'ORIGEN_APP', valor: 15, detalle: 'La foto se sacó con la cámara de la app' }],
        fotos: [{ id: 12, url: '/api/fotos/12' }],
      },
      {
        id: 20,
        incidenteId: 14,
        registradoEn: '2026-10-13T10:00:00.000Z',
        categoria: { id: 2, nombre: 'Vereda rota' },
        severidadDeclarada: 'LEVE',
        descripcion: null,
        direccion: null,
        lat: -38.9516,
        lon: -68.0591,
        origen: 'SITIO_WEB',
        nivelConfianza: 20,
        estadoVerificacion: 'DESESTIMADO',
        senales: [{ tipo: 'HASH_DUPLICADO', valor: -40, detalle: 'La foto ya se usó en otro reporte' }],
        fotos: [{ id: 20, url: '/api/fotos/20' }],
      },
    ],
    bitacora: [
      movimiento(30, {
        tipo: 'CAMBIO_ESTADO',
        usuario: null,
        estadoAnterior: 'REGISTRADO',
        estadoNuevo: 'VERIFICADO',
        comentario: 'Se verificó el primer reporte',
      }),
    ],
    cierre: null,
    ...cambios,
  };
}

// El servidor simulado guarda la ficha y la cambia con cada acción, como el real: al volver a pedirla trae lo nuevo.
let ficha: FichaGestion;
let pedidos: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
let fotosPedidas: { id: string; autorizacion: string | null }[] = [];
let siguienteMovimiento = 100;

const anotar = async (request: Request) => {
  const texto = await request.text();
  const pedido = {
    metodo: request.method,
    ruta: new URL(request.url).pathname,
    cuerpo: texto ? JSON.parse(texto) : null,
  };
  pedidos.push(pedido);
  return pedido.cuerpo as Record<string, unknown> | null;
};
const agregarMovimiento = (datos: Partial<Movimiento>) => {
  const nuevo = movimiento(siguienteMovimiento++, { creadoEn: '2026-10-27T12:00:00.000Z', ...datos });
  ficha = { ...ficha, bitacora: [...ficha.bitacora, nuevo] };
  return nuevo;
};

const servidor = setupServer(
  http.get('*/api/auth/yo', () =>
    HttpResponse.json({
      usuario: { ...operador, email: 'bacheo@ejemplo.com', rol: 'OPERADOR', organismoId: 1, areaId: 1 },
    }),
  ),
  http.get('*/api/categorias', () => HttpResponse.json({ categorias })),
  http.get('*/api/incidentes/:id/gestion', () => HttpResponse.json(ficha)),
  http.get('*/api/fotos/:id', ({ params, request }) => {
    fotosPedidas.push({ id: String(params.id), autorizacion: request.headers.get('Authorization') });
    return new HttpResponse('foto', { headers: { 'Content-Type': 'image/jpeg' } });
  }),
  http.post('*/api/incidentes/:id/comentarios', async ({ request }) => {
    const cuerpo = await anotar(request);
    return HttpResponse.json(
      { id: 7, movimiento: agregarMovimiento({ comentario: String(cuerpo?.comentario) }) },
      { status: 201 },
    );
  }),
  http.post('*/api/incidentes/:id/estado', async ({ request }) => {
    const cuerpo = (await anotar(request)) as { estado: 'EN_EJECUCION' | 'DESESTIMADO'; comentario?: string };
    const nuevo = agregarMovimiento({
      tipo: 'CAMBIO_ESTADO',
      estadoAnterior: ficha.estado,
      estadoNuevo: cuerpo.estado,
      comentario: `Desestimado: ${cuerpo.comentario}`,
    });
    ficha = { ...ficha, estado: cuerpo.estado };
    return HttpResponse.json({ id: 7, estado: cuerpo.estado, movimiento: nuevo });
  }),
  http.post('*/api/incidentes/:id/derivacion', async ({ request }) => {
    const cuerpo = (await anotar(request)) as { areaId: number };
    const area = cuerpo.areaId === 2 ? { id: 2, nombre: 'Veredas' } : { id: 1, nombre: 'Bacheo' };
    const nuevo = agregarMovimiento({
      tipo: 'DERIVACION',
      area,
      estadoAnterior: ficha.estado,
      estadoNuevo: 'DERIVADO',
      comentario: `Derivado a ${area.nombre}`,
    });
    ficha = { ...ficha, estado: 'DERIVADO', area };
    return HttpResponse.json({ id: 7, estado: 'DERIVADO', area, movimiento: nuevo });
  }),
  http.put('*/api/incidentes/:id/prioridad-manual', async ({ request }) => {
    const cuerpo = (await anotar(request)) as { valor: number; motivo: string };
    const prioridad = {
      ...ficha.prioridad,
      prioridadManual: cuerpo.valor,
      motivoPrioridadManual: cuerpo.motivo,
      ajustadaPor: operador,
    };
    agregarMovimiento({
      tipo: 'AJUSTE_PRIORIDAD',
      comentario: `Prioridad fijada en ${cuerpo.valor}: ${cuerpo.motivo}`,
    });
    ficha = { ...ficha, prioridad };
    // Como el servidor real: la respuesta trae la prioridad, no el movimiento.
    return HttpResponse.json({ id: 7, ...prioridad });
  }),
  http.put('*/api/incidentes/:id/categoria', async ({ request }) => {
    const cuerpo = (await anotar(request)) as { categoriaId: number };
    const categoria = categorias.find((c) => c.id === cuerpo.categoriaId)!;
    const nuevo = agregarMovimiento({
      comentario: `Categoría cambiada de ${ficha.categoria.nombre} a ${categoria.nombre}`,
    });
    ficha = { ...ficha, categoria: { id: categoria.id, nombre: categoria.nombre }, area: categoria.area };
    return HttpResponse.json({
      id: 7,
      categoria: ficha.categoria,
      area: ficha.area,
      prioridad: ficha.prioridad,
      movimiento: nuevo,
    });
  }),
);

// La foto se muestra desde una URL local, que jsdom no sabe crear.
const urlsOriginales = { crear: URL.createObjectURL, liberar: URL.revokeObjectURL };
beforeAll(() => {
  servidor.listen();
  URL.createObjectURL = vi.fn(() => 'blob:foto-local');
  URL.revokeObjectURL = vi.fn();
});
afterAll(() => {
  servidor.close();
  URL.createObjectURL = urlsOriginales.crear;
  URL.revokeObjectURL = urlsOriginales.liberar;
});
beforeEach(() => {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  ficha = fichaBase();
  pedidos = [];
  fotosPedidas = [];
});
afterEach(() => servidor.resetHandlers());

const montar = (id = 7) => renderConSesion(`/bandeja/${id}`, { '/bandeja/:id': <PaginaFicha /> });
const titulo = () => screen.findByRole('heading', { level: 1 });
const bitacora = () => screen.getByRole('list', { name: 'Movimientos' });
const acciones = () =>
  [
    'Derivar…',
    'Pasar a ejecución…',
    'Cambiar la categoría…',
    'Desestimar…',
    'Fijar a mano…',
    'Quitar el ajuste',
  ].filter((nombre) => screen.queryByRole('button', { name: nombre }) !== null);

describe('ficha del incidente para el operador', () => {
  it('muestra los reportes con su confianza y sus señales, también los desestimados de un unido', async () => {
    montar();
    expect(await titulo()).toHaveTextContent('Incidente #7 · Pozo en la calzada');

    expect(screen.getByText('Reporte #12 · Pozo en la calzada · Grave')).toBeInTheDocument();
    expect(screen.getAllByText(/\/100/).map((texto) => texto.textContent)).toEqual([
      'Confianza 65/100 · Verificado',
      'Confianza 20/100 · Desestimado',
    ]);
    expect(screen.getByText(/La foto se sacó con la cámara de la app/)).toBeInTheDocument();
    expect(screen.getByText(/Foto repetida \(-40\)/)).toBeInTheDocument();
    expect(screen.getByText('Del incidente #14, unido a este')).toBeInTheDocument();

    // Las fotos se piden con la sesión: así el operador ve también la del reporte desestimado.
    await waitFor(() => expect(fotosPedidas.map((foto) => foto.id).sort()).toEqual(['12', '20']));
    expect(fotosPedidas.every((foto) => foto.autorizacion === 'Bearer acceso')).toBe(true);
  });

  it('muestra el desglose de la prioridad y la bitácora', async () => {
    montar();
    await titulo();

    const desglose = screen.getByRole('list', { name: 'Desglose de la prioridad' });
    expect(within(desglose).getByText('Gravedad grave en Pozo en la calzada: +60')).toBeInTheDocument();
    expect(within(desglose).getByText('A 80 m de Escuela N° 123 (escuela): +15')).toBeInTheDocument();
    // El detalle ya termina con el número: no se repite en otra columna.
    expect(within(desglose).queryByText('+15')).not.toBeInTheDocument();
    expect(within(desglose).queryByText('+60')).not.toBeInTheDocument();
    expect(screen.getByText('94,49')).toBeInTheDocument();

    expect(within(bitacora()).getByText('Sistema', { exact: false })).toBeInTheDocument();
    expect(within(bitacora()).getByText('Se verificó el primer reporte')).toBeInTheDocument();
    expect(within(bitacora()).getByText(/En revisión → Verificado/)).toBeInTheDocument();
  });

  it('verificado: ofrece derivar, cambiar la categoría, desestimar y fijar la prioridad', async () => {
    montar();
    await titulo();
    // Derivar y cambiar la categoría aparecen cuando llegan las áreas y las categorías.
    await waitFor(() =>
      expect(acciones()).toEqual(['Derivar…', 'Cambiar la categoría…', 'Desestimar…', 'Fijar a mano…']),
    );
  });

  it('al operador le ofrece ir a Incidentes para unir o separar', async () => {
    montar();

    expect(await screen.findByRole('link', { name: 'Unir o separar en Incidentes' })).toHaveAttribute(
      'href',
      '/incidentes',
    );
  });

  it('al administrador no, porque Incidentes es solo del operador', async () => {
    servidor.use(
      http.get('*/api/auth/yo', () =>
        HttpResponse.json({
          usuario: {
            ...operador,
            email: 'admin@ejemplo.com',
            rol: 'ADMINISTRADOR',
            organismoId: 1,
            areaId: null,
          },
        }),
      ),
    );
    montar();
    await titulo();
    await waitFor(() => expect(acciones()).toContain('Desestimar…'));

    expect(screen.queryByRole('link', { name: 'Unir o separar en Incidentes' })).not.toBeInTheDocument();
  });

  it('derivado y con ajuste: suma pasar a ejecución y quitar el ajuste', async () => {
    ficha = fichaBase({
      estado: 'DERIVADO',
      prioridad: {
        ...fichaBase().prioridad,
        prioridadManual: 80,
        motivoPrioridadManual: 'Obra',
        ajustadaPor: operador,
      },
    });
    montar();
    await titulo();
    await waitFor(() =>
      expect(acciones()).toEqual([
        'Derivar…',
        'Pasar a ejecución…',
        'Cambiar la categoría…',
        'Desestimar…',
        'Quitar el ajuste',
      ]),
    );
    expect(screen.getByRole('button', { name: 'Cambiar el ajuste…' })).toBeInTheDocument();
  });

  it('derivado en un organismo con una sola área: no ofrece derivar, porque no hay otra', async () => {
    servidor.use(http.get('*/api/categorias', () => HttpResponse.json({ categorias: [categorias[0]] })));
    ficha = fichaBase({ estado: 'DERIVADO' });
    montar();
    await titulo();

    await waitFor(() =>
      expect(acciones()).toEqual([
        'Pasar a ejecución…',
        'Cambiar la categoría…',
        'Desestimar…',
        'Fijar a mano…',
      ]),
    );
  });

  it('si no llegan las áreas y las categorías, lo dice y deja reintentar', async () => {
    servidor.use(
      http.get(
        '*/api/categorias',
        () =>
          HttpResponse.json(
            { error: { codigo: 'ERROR_INTERNO', mensaje: 'Falló el servidor.' } },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    const usuario = userEvent.setup();
    montar();
    await titulo();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falló el servidor. Sin las áreas y las categorías no se puede derivar ni cambiar la categoría.',
    );
    expect(acciones()).toEqual(['Desestimar…', 'Fijar a mano…']);

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() =>
      expect(acciones()).toEqual(['Derivar…', 'Cambiar la categoría…', 'Desestimar…', 'Fijar a mano…']),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('unido a otro: no ofrece acciones, explica por qué y lleva al principal', async () => {
    ficha = fichaBase({ estado: 'DERIVADO', incidentePrincipalId: 9, unidos: [] });
    montar();
    await titulo();

    expect(acciones()).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Está unido al incidente #9: se gestiona desde ese.',
    );
    expect(screen.getByRole('link', { name: 'Ir al #9' })).toHaveAttribute('href', '/bandeja/9');
    // Comentar se puede siempre.
    expect(screen.getByRole('button', { name: 'Comentar' })).toBeInTheDocument();
  });

  it('desestimado: no ofrece acciones', async () => {
    ficha = fichaBase({ estado: 'DESESTIMADO' });
    montar();
    await titulo();
    expect(acciones()).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Está desestimado.');
  });

  it('comentar agrega el movimiento a la bitácora sin recargar la página', async () => {
    const usuario = userEvent.setup();
    montar();
    await titulo();

    await usuario.click(screen.getByRole('button', { name: 'Comentar' }));
    expect(screen.getByText('Escribí el comentario')).toBeInTheDocument();
    expect(pedidos).toEqual([]);

    await usuario.type(screen.getByLabelText('Comentario'), '  La cuadrilla pasa el lunes ');
    await usuario.click(screen.getByRole('button', { name: 'Comentar' }));

    expect(await within(bitacora()).findByText('La cuadrilla pasa el lunes')).toBeInTheDocument();
    expect(pedidos).toEqual([
      {
        metodo: 'POST',
        ruta: '/api/incidentes/7/comentarios',
        cuerpo: { comentario: 'La cuadrilla pasa el lunes' },
      },
    ]);
    expect(screen.getByLabelText('Comentario')).toHaveValue('');
    // Lo último va primero.
    expect(within(bitacora()).getAllByRole('listitem')[0]).toHaveTextContent('La cuadrilla pasa el lunes');
  });

  it('desestimar pide el motivo y una confirmación antes de mandarlo', async () => {
    const usuario = userEvent.setup();
    montar();
    await titulo();

    await usuario.click(screen.getByRole('button', { name: 'Desestimar…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Desestimar el incidente #7' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desestimar' }));
    expect(within(dialogo).getByText('Escribí el motivo')).toBeInTheDocument();

    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Ya estaba arreglado');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desestimar' }));
    expect(within(dialogo).getByText(/Es definitivo: no se puede volver a abrir/)).toBeInTheDocument();
    expect(pedidos).toEqual([]);

    await usuario.click(within(dialogo).getByRole('button', { name: 'Sí, desestimar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(pedidos).toEqual([
      {
        metodo: 'POST',
        ruta: '/api/incidentes/7/estado',
        cuerpo: { estado: 'DESESTIMADO', comentario: 'Ya estaba arreglado' },
      },
    ]);
    expect(within(bitacora()).getByText('Desestimado: Ya estaba arreglado')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Está desestimado.');
    expect(acciones()).toEqual([]);
  });

  it('cancelar la confirmación no manda nada', async () => {
    const usuario = userEvent.setup();
    ficha = fichaBase({ estado: 'DERIVADO' });
    montar();
    await titulo();

    await usuario.click(screen.getByRole('button', { name: 'Pasar a ejecución…' }));
    const dialogo = screen.getByRole('dialog');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Pasar a ejecución' }));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(within(dialogo).getByRole('button', { name: 'Pasar a ejecución' })).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it('derivar un verificado pide confirmación; re-derivar uno derivado, no', async () => {
    const usuario = userEvent.setup();
    montar();
    await titulo();

    await usuario.click(await screen.findByRole('button', { name: 'Derivar…' }));
    let dialogo = screen.getByRole('dialog');
    await usuario.selectOptions(within(dialogo).getByLabelText('Área'), 'Bacheo');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Derivar' }));
    expect(pedidos).toEqual([]);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Sí, derivar' }));
    expect(await within(bitacora()).findByText('Derivado a Bacheo')).toBeInTheDocument();

    // Ya derivado a Bacheo: el área actual no se ofrece y no hay confirmación.
    await usuario.click(screen.getByRole('button', { name: 'Derivar…' }));
    dialogo = screen.getByRole('dialog');
    expect(within(dialogo).queryByRole('option', { name: 'Bacheo' })).not.toBeInTheDocument();
    await usuario.selectOptions(within(dialogo).getByLabelText('Área'), 'Veredas');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Derivar' }));

    expect(await within(bitacora()).findByText('Derivado a Veredas')).toBeInTheDocument();
    expect(pedidos.map((pedido) => pedido.cuerpo)).toEqual([{ areaId: 1 }, { areaId: 2 }]);
  });

  it('fijar la prioridad a mano actualiza el desglose y la bitácora, aunque la respuesta no traiga el movimiento', async () => {
    const usuario = userEvent.setup();
    montar();
    await titulo();

    await usuario.click(screen.getByRole('button', { name: 'Fijar a mano…' }));
    const dialogo = screen.getByRole('dialog');
    await usuario.type(within(dialogo).getByLabelText('Prioridad'), '10000');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar la prioridad' }));
    expect(within(dialogo).getByText('Tiene que estar entre 0 y 9.999,99')).toBeInTheDocument();
    expect(within(dialogo).getByText('Escribí el motivo')).toBeInTheDocument();
    expect(pedidos).toEqual([]);

    await usuario.clear(within(dialogo).getByLabelText('Prioridad'));
    await usuario.type(within(dialogo).getByLabelText('Prioridad'), '80');
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Obra programada');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar la prioridad' }));

    expect((await screen.findByText('Fijada a mano')).closest('p')).toHaveTextContent(
      'Fijada a mano por Operador de Bacheo: Obra programada. La calculada es 94,49.',
    );
    expect(
      await within(bitacora()).findByText('Prioridad fijada en 80: Obra programada'),
    ).toBeInTheDocument();
    expect(pedidos.at(-1)).toEqual({
      metodo: 'PUT',
      ruta: '/api/incidentes/7/prioridad-manual',
      cuerpo: { valor: 80, motivo: 'Obra programada' },
    });
  });

  it('cambiar la categoría la actualiza en la ficha y deja el movimiento', async () => {
    const usuario = userEvent.setup();
    montar();
    await titulo();

    await usuario.click(await screen.findByRole('button', { name: 'Cambiar la categoría…' }));
    const dialogo = screen.getByRole('dialog');
    // La actual no se ofrece.
    expect(within(dialogo).queryByRole('option', { name: /Pozo en la calzada/ })).not.toBeInTheDocument();
    await usuario.selectOptions(within(dialogo).getByLabelText('Categoría nueva'), 'Vereda rota (Veredas)');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cambiar la categoría' }));

    expect(await titulo()).toHaveTextContent('Incidente #7 · Vereda rota');
    expect(
      within(bitacora()).getByText('Categoría cambiada de Pozo en la calzada a Vereda rota'),
    ).toBeInTheDocument();
    expect(pedidos.at(-1)?.cuerpo).toEqual({ categoriaId: 2 });
  });

  it('si el servidor rechaza la acción, lo explica en el diálogo y vuelve a pedir la ficha', async () => {
    let fichasPedidas = 0;
    servidor.use(
      http.get('*/api/incidentes/:id/gestion', () => {
        fichasPedidas++;
        return HttpResponse.json(ficha);
      }),
      http.post('*/api/incidentes/:id/estado', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'TRANSICION_INVALIDA',
              mensaje: 'Un incidente RESUELTO no puede pasar a DESESTIMADO',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const usuario = userEvent.setup();
    montar();
    await titulo();

    await usuario.click(screen.getByRole('button', { name: 'Desestimar…' }));
    const dialogo = screen.getByRole('dialog');
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Duplicado');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desestimar' }));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Sí, desestimar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Un incidente RESUELTO no puede pasar a DESESTIMADO',
    );
    await waitFor(() => expect(fichasPedidas).toBe(2));
  });

  it('un id que no es un número no pide nada', async () => {
    renderConSesion('/bandeja/abc', { '/bandeja/:id': <PaginaFicha /> });
    expect(await screen.findByRole('alert')).toHaveTextContent('El incidente no existe');
  });
});

describe('cierre con la foto del después', () => {
  const cierre = (
    resultado: ResultadoCierre,
    quienCerro = { id: 9, nombre: 'Operadora de Veredas' },
  ): CierreGestion => ({
    id: 4,
    resultadoComparacion: resultado,
    distanciaMetros: resultado === 'OBSERVADO' ? null : 12,
    detalleComparacion:
      resultado === 'OBSERVADO'
        ? 'La foto no trae la ubicación donde se sacó: no se puede comprobar que sea del mismo lugar.'
        : 'La foto es del lugar (a 12 m). La comparación con el antes dice que está resuelto.',
    creadoEn: '2026-10-27T11:00:00.000Z',
    usuario: quienCerro,
    fotos: [{ id: 50, url: '/api/fotos/50' }],
  });

  /** El servidor responde al cierre con `resultado` y deja la ficha como quedaría. */
  function responderCierre(resultado: ResultadoCierre, detalle: string) {
    servidor.use(
      http.post('*/api/incidentes/:id/cierre', ({ request }) => {
        // El cuerpo es multipart: en jsdom leerlo no termina nunca, así que solo se anota la ruta.
        pedidos.push({ metodo: request.method, ruta: new URL(request.url).pathname, cuerpo: null });
        const estado = resultado === 'VALIDADO' ? 'RESUELTO' : 'EN_EJECUCION';
        const nuevo = { ...cierre(resultado, operador), detalleComparacion: detalle };
        ficha = { ...ficha, estado, cierre: nuevo };
        return HttpResponse.json(
          { incidente: { id: 7, estado }, cierre: { ...nuevo, resultadoComparacion: resultado } },
          { status: 201 },
        );
      }),
    );
  }

  const subirFoto = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(screen.getByRole('button', { name: 'Cerrar con foto…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Cerrar el incidente #7' });
    await usuario.upload(
      within(dialogo).getByLabelText('Foto del después'),
      new File(['foto'], 'despues.jpg', { type: 'image/jpeg' }),
    );
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar la foto' }));
    return dialogo;
  };

  it('solo en ejecución se ofrece cerrar con foto', async () => {
    ficha = fichaBase({ estado: 'DERIVADO' });
    montar();
    await titulo();
    expect(screen.queryByRole('button', { name: 'Cerrar con foto…' })).not.toBeInTheDocument();
  });

  it('un cierre rechazado explica por qué y deja probar con otra foto', async () => {
    ficha = fichaBase({ estado: 'EN_EJECUCION' });
    responderCierre('RECHAZADO', 'La foto se sacó a 1112 m del incidente, y el máximo es 50 m.');
    const usuario = userEvent.setup();
    montar();
    await titulo();

    const dialogo = await subirFoto(usuario);

    expect(await within(dialogo).findByText('El cierre no se aceptó')).toBeInTheDocument();
    expect(within(dialogo).getByText(/a 1112 m del incidente/)).toBeInTheDocument();
    expect(pedidos).toEqual([{ metodo: 'POST', ruta: '/api/incidentes/7/cierre', cuerpo: null }]);

    await usuario.click(within(dialogo).getByRole('button', { name: 'Probar con otra foto' }));
    expect(within(dialogo).getByLabelText('Foto del después')).toBeInTheDocument();
  });

  it('un cierre validado resuelve el incidente', async () => {
    ficha = fichaBase({ estado: 'EN_EJECUCION' });
    responderCierre('VALIDADO', 'La foto es del lugar (a 12 m). Está resuelto.');
    const usuario = userEvent.setup();
    montar();
    await titulo();

    const dialogo = await subirFoto(usuario);
    expect(await within(dialogo).findByText('Incidente resuelto')).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Listo' }));

    expect(await screen.findByText('Está resuelto.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar con foto…' })).not.toBeInTheDocument();
  });

  it('pedir enviar sin elegir la foto lo marca y no manda nada', async () => {
    ficha = fichaBase({ estado: 'EN_EJECUCION' });
    const usuario = userEvent.setup();
    montar();
    await titulo();

    await usuario.click(screen.getByRole('button', { name: 'Cerrar con foto…' }));
    const dialogo = screen.getByRole('dialog');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar la foto' }));

    expect(within(dialogo).getByText('Elegí la foto del después')).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it('muestra el antes y el después lado a lado, con el resultado y su explicación', async () => {
    ficha = fichaBase({ estado: 'EN_EJECUCION', cierre: cierre('OBSERVADO') });
    montar();

    const seccion = (await screen.findByRole('heading', { name: 'Cierre' })).closest('section')!;
    expect(within(seccion).getByText('Por confirmar')).toBeInTheDocument();
    expect(within(seccion).getByText(/no trae la ubicación donde se sacó/)).toBeInTheDocument();
    expect(within(seccion).getByText('Antes')).toBeInTheDocument();
    expect(within(seccion).getByText('Después')).toBeInTheDocument();
    // La foto del antes (la del reporte verificado) y la del después, con la sesión del operador.
    await waitFor(() =>
      expect(fotosPedidas.map((foto) => foto.id)).toEqual(expect.arrayContaining(['12', '50'])),
    );
  });

  it('otro operador confirma un cierre observado, con una confirmación antes de mandarlo', async () => {
    ficha = fichaBase({ estado: 'EN_EJECUCION', cierre: cierre('OBSERVADO') });
    servidor.use(
      http.post('*/api/incidentes/:id/cierre/confirmacion', async ({ request }) => {
        await anotar(request);
        const nuevo = agregarMovimiento({
          tipo: 'CAMBIO_ESTADO',
          estadoAnterior: 'EN_EJECUCION',
          estadoNuevo: 'RESUELTO',
          comentario: 'Cierre observado confirmado',
        });
        ficha = {
          ...ficha,
          estado: 'RESUELTO',
          cierre: { ...ficha.cierre!, resultadoComparacion: 'VALIDADO' },
        };
        return HttpResponse.json({
          incidente: { id: 7, estado: 'RESUELTO' },
          cierre: { id: 4, resultadoComparacion: 'VALIDADO' },
          movimiento: nuevo,
        });
      }),
    );
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Confirmar el cierre…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Confirmar el cierre del #7' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar el cierre' }));
    expect(pedidos).toEqual([]);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Sí, resolver' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(pedidos).toEqual([
      { metodo: 'POST', ruta: '/api/incidentes/7/cierre/confirmacion', cuerpo: { aceptar: true } },
    ]);
    expect(within(bitacora()).getByText('Cierre observado confirmado')).toBeInTheDocument();
  });

  it('rechazar un cierre observado pide el motivo', async () => {
    ficha = fichaBase({ estado: 'EN_EJECUCION', cierre: cierre('OBSERVADO') });
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Rechazar el cierre…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Rechazar el cierre del #7' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Rechazar el cierre' }));

    expect(within(dialogo).getByText('Escribí el motivo')).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it('quien cerró no ve cómo confirmar su propio cierre: espera a otro operador', async () => {
    ficha = fichaBase({ estado: 'EN_EJECUCION', cierre: cierre('OBSERVADO', operador) });
    montar();

    expect(await screen.findByText(/Espera que otro operador del organismo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar el cierre…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar con foto…' })).not.toBeInTheDocument();
  });
});
