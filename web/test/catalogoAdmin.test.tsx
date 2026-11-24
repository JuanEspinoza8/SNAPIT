import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaCategorias } from '../src/funcionalidades/administracion/catalogo/paginaCategorias.js';
import { PaginaMatriz } from '../src/funcionalidades/administracion/catalogo/paginaMatriz.js';
import { PaginaParametros } from '../src/funcionalidades/administracion/catalogo/paginaParametros.js';
import { PaginaPerfiles } from '../src/funcionalidades/administracion/catalogo/paginaPerfiles.js';
import type {
  CategoriaAdmin,
  Parametro,
  PerfilAdmin,
} from '../src/funcionalidades/administracion/catalogo/tipos.js';
import {
  agruparParametros,
  problemaCelda,
  problemaFactor,
  problemaParametro,
} from '../src/funcionalidades/administracion/catalogo/validaciones.js';
import { renderRuta } from './apoyo.js';

const celdas = (silla: Partial<CategoriaAdmin['perfiles'][number]> = {}) => [
  { perfilMovilidadId: 1, nombre: 'Baja visión', activo: true, intransitable: false, factorPenalizacion: 1 },
  {
    perfilMovilidadId: 2,
    nombre: 'Silla de ruedas',
    activo: true,
    intransitable: true,
    factorPenalizacion: 1,
    ...silla,
  },
];

const pozo: CategoriaAdmin = {
  id: 10,
  nombre: 'Pozo en la calzada',
  descripcion: null,
  area: { id: 3, nombre: 'Bacheo', activa: true },
  tipoVigenciaDefault: 'PERMANENTE',
  diasCaducidadDefault: null,
  pesoSeveridadBase: 1.2,
  activa: true,
  perfiles: celdas(),
};
const vereda: CategoriaAdmin = {
  ...pozo,
  id: 11,
  nombre: 'Vereda rota',
  area: { id: 4, nombre: 'Veredas', activa: true },
  tipoVigenciaDefault: 'TEMPORAL',
  diasCaducidadDefault: 30,
  activa: false,
  perfiles: celdas({ intransitable: false, factorPenalizacion: 2 }),
};

const silla: PerfilAdmin = {
  id: 2,
  nombre: 'Silla de ruedas',
  descripcion: 'Necesita rampas',
  activo: true,
  reglas: [
    { regla: 'escalera', clave: 'ruteo.escalera.perfil_2', valor: 'intransitable' },
    { regla: 'angosto', clave: 'ruteo.angosto.perfil_2', valor: '2.0' },
    { regla: 'cruce_sin_senal', clave: 'ruteo.cruce_sin_senal.perfil_2', valor: null },
  ],
};

const parametros: Parametro[] = [
  {
    clave: 'agrupacion.radio_m',
    valor: '30',
    tipo: 'entero',
    descripcion: 'Distancia máxima a un incidente',
  },
  { clave: 'agrupacion.umbral', valor: '0.5', tipo: 'decimal', descripcion: 'Puntaje mínimo para sumarse' },
  { clave: 'cierre.distancia_max_m', valor: '50', tipo: 'entero', descripcion: 'Lejos de la foto de antes' },
  {
    clave: 'ruteo.escalera.perfil_2',
    valor: 'intransitable',
    tipo: 'factor',
    descripcion: 'Regla de perfil',
  },
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

const servidor = setupServer(
  http.get('*/api/admin/categorias', () => HttpResponse.json({ categorias: [pozo, vereda] })),
  http.get('*/api/admin/perfiles-movilidad', () => HttpResponse.json({ perfiles: [silla] })),
  http.get('*/api/admin/parametros', () => HttpResponse.json({ parametros })),
  http.get('*/api/admin/organismos', () =>
    HttpResponse.json({
      organismos: [
        {
          id: 1,
          nombre: 'Vialidad',
          areas: [
            { id: 3, nombre: 'Bacheo' },
            { id: 4, nombre: 'Veredas' },
          ],
        },
      ],
    }),
  ),
  http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [] })),
  http.post('*/api/admin/categorias', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json({ categoria: { ...pozo, id: 99 } }, { status: 201 });
  }),
  http.put('*/api/admin/categorias/:id', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json({ categoria: pozo, prioridadesRecalculadas: 3 });
  }),
  http.put('*/api/admin/categorias/:id/perfiles', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json({ perfiles: [] });
  }),
  http.put('*/api/admin/parametros', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json({ parametros: [] });
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  pedidos.length = 0;
});

describe('validaciones de la administración del catálogo', () => {
  it('un factor es un número mayor que 0 o «intransitable»', () => {
    expect(problemaFactor('2.5')).toBeNull();
    expect(problemaFactor(' intransitable ')).toBeNull();
    for (const malo of ['0', '-1', 'mucho', '', '1,5']) expect(problemaFactor(malo)).not.toBeNull();
  });

  it('un parámetro se valida por su tipo, y ninguno acepta negativos', () => {
    expect(problemaParametro('entero', '30')).toBeNull();
    expect(problemaParametro('entero', '30.5')).toBe('Tiene que ser un número entero');
    expect(problemaParametro('decimal', '0.75')).toBeNull();
    expect(problemaParametro('decimal', '0,75')).toBe('Con punto para los decimales, no coma');
    expect(problemaParametro('decimal', '-1')).toBe('No puede ser negativo');
    expect(problemaParametro('entero', '')).toBe('Es obligatorio');
  });

  it('una celda de la matriz tiene hasta dos decimales y hasta 999,99', () => {
    expect(problemaCelda('2.25')).toBeNull();
    expect(problemaCelda('2.255')).toBe('Un número con hasta dos decimales');
    expect(problemaCelda('1000')).toBe('Tiene que ser hasta 999.99');
    expect(problemaCelda('0')).toBe('Tiene que ser mayor que 0');
  });

  it('agrupa los parámetros por cálculo y deja afuera las reglas de cada perfil', () => {
    const grupos = agruparParametros(parametros);
    expect(grupos.map((grupo) => [grupo.nombre, grupo.parametros.map((p) => p.clave)])).toEqual([
      ['Agrupación de reportes', ['agrupacion.radio_m', 'agrupacion.umbral']],
      ['Cierre', ['cierre.distancia_max_m']],
    ]);
  });
});

describe('parámetros', () => {
  it('cada parámetro muestra para qué sirve, agrupado por cálculo', async () => {
    renderRuta('/administracion/parametros', <PaginaParametros />);

    const grupo = await screen.findByRole('form', { name: 'Agrupación de reportes' });
    expect(within(grupo).getByLabelText('agrupacion.radio_m')).toHaveAccessibleDescription(
      'Distancia máxima a un incidente',
    );
    expect(screen.queryByLabelText('ruteo.escalera.perfil_2')).not.toBeInTheDocument();
  });

  it('un valor inválido se marca antes de enviar y no deja guardar', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/parametros', <PaginaParametros />);
    const grupo = await screen.findByRole('form', { name: 'Agrupación de reportes' });
    const radio = within(grupo).getByLabelText('agrupacion.radio_m');

    await usuario.clear(radio);
    await usuario.type(radio, '30.5');

    expect(radio).toHaveAttribute('aria-invalid', 'true');
    expect(within(grupo).getByText('Tiene que ser un número entero')).toBeInTheDocument();
    expect(within(grupo).getByRole('button', { name: 'Guardar agrupación de reportes' })).toBeDisabled();
    expect(pedidos).toEqual([]);
  });

  it('guarda solo lo que cambió del grupo, y muestra en el campo la regla que rechaza el servidor', async () => {
    servidor.use(
      http.put('*/api/admin/parametros', async ({ request }) => {
        await anotar(request);
        return HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay valores inválidos',
              detalles: [{ campo: 'agrupacion.radio_m', mensaje: 'Tiene que ser mayor que 0' }],
            },
          },
          { status: 400 },
        );
      }),
    );
    const usuario = userEvent.setup();
    renderRuta('/administracion/parametros', <PaginaParametros />);
    const grupo = await screen.findByRole('form', { name: 'Agrupación de reportes' });
    const radio = within(grupo).getByLabelText('agrupacion.radio_m');

    await usuario.clear(radio);
    await usuario.type(radio, '0');
    await usuario.click(within(grupo).getByRole('button', { name: 'Guardar agrupación de reportes' }));

    expect(await within(grupo).findByText('Tiene que ser mayor que 0')).toBeInTheDocument();
    expect(pedidos).toEqual([
      {
        metodo: 'PUT',
        ruta: '/api/admin/parametros',
        cuerpo: { parametros: [{ clave: 'agrupacion.radio_m', valor: '0' }] },
      },
    ]);
  });
});

describe('matriz categoría × perfil', () => {
  it('marca una celda inválida, y guarda las cambiadas por categoría', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/matriz', <PaginaMatriz />);
    const celda = await screen.findByLabelText('Pozo en la calzada para Baja visión');
    const guardar = () => screen.getByRole('button', { name: /^Guardar cambios/ });

    await usuario.clear(celda);
    await usuario.type(celda, '0');
    expect(celda).toHaveAttribute('aria-invalid', 'true');
    expect(guardar()).toBeDisabled();

    await usuario.clear(celda);
    await usuario.type(celda, '2.5');
    const otra = screen.getByLabelText('Vereda rota para Silla de ruedas');
    await usuario.clear(otra);
    await usuario.type(otra, 'intransitable');
    // Escribir lo mismo que había no cuenta como cambio.
    const igual = screen.getByLabelText('Vereda rota para Baja visión');
    await usuario.clear(igual);
    await usuario.type(igual, '1.0');
    await usuario.click(guardar());

    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(pedidos).toEqual([
      {
        metodo: 'PUT',
        ruta: '/api/admin/categorias/10/perfiles',
        cuerpo: { perfiles: [{ perfilMovilidadId: 1, intransitable: false, factorPenalizacion: 2.5 }] },
      },
      {
        metodo: 'PUT',
        ruta: '/api/admin/categorias/11/perfiles',
        // Intransitable conserva el factor que tenía.
        cuerpo: { perfiles: [{ perfilMovilidadId: 2, intransitable: true, factorPenalizacion: 2 }] },
      },
    ]);
  });
});

describe('categorías', () => {
  it('lista las categorías con su área, vigencia y peso, y marca las dadas de baja', async () => {
    renderRuta('/administracion/categorias', <PaginaCategorias />);

    const pozoFila = await screen.findByRole('listitem', { name: 'Pozo en la calzada' });
    expect(within(pozoFila).getByText(/Bacheo · Permanente · Pesa ×1,20/)).toBeInTheDocument();
    const veredaFila = screen.getByRole('listitem', { name: 'Vereda rota' });
    expect(within(veredaFila).getByText('Dada de baja')).toBeInTheDocument();
    expect(within(veredaFila).getByText(/Temporal: caduca a los 30 días/)).toBeInTheDocument();
  });

  it('el peso inválido se marca antes de enviar; una categoría válida se da de alta', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/categorias', <PaginaCategorias />);
    await screen.findByRole('listitem', { name: 'Pozo en la calzada' });

    await usuario.click(screen.getByRole('button', { name: 'Nueva categoría' }));
    const dialogo = screen.getByRole('dialog', { name: 'Nueva categoría' });
    await usuario.type(within(dialogo).getByLabelText('Nombre'), 'Semáforo roto');
    await within(dialogo).findByRole('option', { name: 'Bacheo' });
    await usuario.selectOptions(within(dialogo).getByLabelText('Área que la atiende'), '3');
    const peso = within(dialogo).getByLabelText('Peso en la prioridad (1 es lo normal)');
    await usuario.clear(peso);
    await usuario.type(peso, '0');
    await usuario.tab();
    expect(within(dialogo).getByText('Tiene que ser mayor que 0')).toBeInTheDocument();

    await usuario.clear(peso);
    await usuario.type(peso, '1,5');
    await usuario.selectOptions(within(dialogo).getByLabelText('Vigencia'), 'TEMPORAL');
    await usuario.type(within(dialogo).getByLabelText(/Días hasta que caduca/), '7');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Semáforo roto dada de alta.')).toBeInTheDocument();
    expect(pedidos).toEqual([
      {
        metodo: 'POST',
        ruta: '/api/admin/categorias',
        cuerpo: {
          nombre: 'Semáforo roto',
          descripcion: null,
          areaId: 3,
          tipoVigenciaDefault: 'TEMPORAL',
          diasCaducidadDefault: 7,
          pesoSeveridadBase: 1.5,
        },
      },
    ]);
  });

  it('al cambiar el peso avisa cuántas prioridades se recalcularon', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/categorias', <PaginaCategorias />);
    await usuario.click(
      within(await screen.findByRole('listitem', { name: 'Pozo en la calzada' })).getByRole('button', {
        name: 'Editar Pozo en la calzada',
      }),
    );
    const dialogo = screen.getByRole('dialog', { name: 'Editar Pozo en la calzada' });
    await within(dialogo).findByRole('option', { name: 'Bacheo' });
    const peso = within(dialogo).getByLabelText('Peso en la prioridad (1 es lo normal)');
    await usuario.clear(peso);
    await usuario.type(peso, '2');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Se recalculó la prioridad de 3 incidente/)).toBeInTheDocument();
    expect(pedidos[0]).toMatchObject({ metodo: 'PUT', ruta: '/api/admin/categorias/10' });
  });
});

describe('perfiles y sus reglas de tramo', () => {
  it('muestra las reglas junto al perfil, marca un valor inválido y guarda las cambiadas como parámetros', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/perfiles', <PaginaPerfiles />);
    const tarjeta = await screen.findByRole('listitem', { name: 'Silla de ruedas' });
    const angosto = within(tarjeta).getByLabelText('Paso angosto');
    expect(within(tarjeta).getByLabelText('Escalera')).toHaveValue('intransitable');
    expect(within(tarjeta).getByLabelText('Cruce sin señal accesible')).toBeDisabled();

    await usuario.clear(angosto);
    await usuario.type(angosto, '0');
    expect(angosto).toHaveAttribute('aria-invalid', 'true');
    expect(within(tarjeta).getByRole('button', { name: 'Guardar reglas' })).toBeDisabled();

    await usuario.clear(angosto);
    await usuario.type(angosto, '3');
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Guardar reglas' }));

    expect(await within(tarjeta).findByText('Reglas guardadas.')).toBeInTheDocument();
    expect(pedidos).toEqual([
      {
        metodo: 'PUT',
        ruta: '/api/admin/parametros',
        cuerpo: { parametros: [{ clave: 'ruteo.angosto.perfil_2', valor: '3' }] },
      },
    ]);
  });
});
