import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaOrganismos } from '../src/funcionalidades/administracion/paginaOrganismos.js';
import type { AreaAdmin, OrganismoAdmin } from '../src/funcionalidades/administracion/tipos.js';
import { renderRuta } from './apoyo.js';

const creadoEn = '2026-10-01T12:00:00.000Z';
const area = (id: number, nombre: string, datos: Partial<AreaAdmin> = {}): AreaAdmin => ({
  id,
  nombre,
  descripcion: null,
  activa: true,
  creadoEn,
  categoriasActivas: 0,
  ...datos,
});

const vialidad: OrganismoAdmin = {
  id: 1,
  nombre: 'Vialidad',
  descripcion: 'Calles y rutas',
  activo: true,
  creadoEn,
  areas: [area(10, 'Bacheo', { categoriasActivas: 2 }), area(11, 'Señalización', { activa: false })],
};
const sinAreas: OrganismoAdmin = {
  id: 2,
  nombre: 'Espacios Verdes',
  descripcion: null,
  activo: true,
  creadoEn,
  areas: [],
};
const inactivo: OrganismoAdmin = {
  id: 3,
  nombre: 'Obras Viejas',
  descripcion: null,
  activo: false,
  creadoEn,
  areas: [area(30, 'Cloacas', { activa: false })],
};

const pedidos: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
const anotar = async (request: Request) => {
  const texto = await request.text();
  pedidos.push({
    metodo: request.method,
    ruta: `${new URL(request.url).pathname}${new URL(request.url).search}`,
    cuerpo: texto ? JSON.parse(texto) : null,
  });
};

const servidor = setupServer(
  http.get('*/api/admin/organismos', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json({ organismos: [vialidad, sinAreas, inactivo] });
  }),
  http.post('*/api/admin/organismos', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json(
      { organismo: { id: 9, nombre: 'Tránsito', descripcion: null, activo: true, creadoEn } },
      { status: 201 },
    );
  }),
  http.put('*/api/admin/organismos/:id', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json({ organismo: { ...inactivo, activo: true } });
  }),
  http.delete('*/api/admin/organismos/:id', async ({ request }) => {
    await anotar(request);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('*/api/admin/areas', async ({ request }) => {
    await anotar(request);
    return HttpResponse.json({ area: { ...area(12, 'Pintura'), organismoId: 1 } }, { status: 201 });
  }),
  http.delete('*/api/admin/areas/:id', async ({ request }) => {
    await anotar(request);
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  pedidos.length = 0;
});

const escrituras = () => pedidos.filter((pedido) => pedido.metodo !== 'GET');
const tarjeta = async (nombre: string) => screen.findByRole('listitem', { name: nombre });

describe('organismos y áreas (F16)', () => {
  it('lista todos los organismos con sus áreas, y marca lo dado de baja', async () => {
    renderRuta('/administracion/organismos', <PaginaOrganismos />);

    const organismo = await tarjeta('Vialidad');
    expect(within(organismo).getByText('Calles y rutas')).toBeInTheDocument();
    expect(
      within(within(organismo).getByRole('listitem', { name: 'Señalización' })).getByText('Dada de baja'),
    ).toBeInTheDocument();
    expect(within(await tarjeta('Obras Viejas')).getByText('Dado de baja')).toBeInTheDocument();
    expect(pedidos[0]?.ruta).toBe('/api/admin/organismos?todos=true');
  });

  it('busca por organismo o por área, sin importar mayúsculas ni tildes', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/organismos', <PaginaOrganismos />);
    await tarjeta('Vialidad');

    await usuario.type(screen.getByLabelText('Buscar'), 'senaliz');
    expect(screen.getByRole('listitem', { name: 'Vialidad' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Espacios Verdes' })).not.toBeInTheDocument();

    await usuario.clear(screen.getByLabelText('Buscar'));
    await usuario.type(screen.getByLabelText('Buscar'), 'zzz');
    expect(screen.getByText('Ningún organismo ni área coincide con la búsqueda.')).toBeInTheDocument();
  });

  it('explica por qué no se puede dar de baja un organismo con áreas activas o un área con categorías', async () => {
    renderRuta('/administracion/organismos', <PaginaOrganismos />);
    const organismo = await tarjeta('Vialidad');

    expect(within(organismo).getByRole('button', { name: 'Dar de baja Vialidad' })).toBeDisabled();
    expect(
      within(organismo).getByText(/primero hay que dar de baja sus áreas activas \(Bacheo\)/),
    ).toBeInTheDocument();
    const bacheo = within(organismo).getByRole('listitem', { name: 'Bacheo' });
    expect(within(bacheo).getByRole('button', { name: 'Dar de baja Bacheo' })).toBeDisabled();
    expect(within(bacheo).getByText(/Tiene 2 categorías activas/)).toBeInTheDocument();
  });

  it('la baja pide confirmación y, al confirmar, la manda', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/organismos', <PaginaOrganismos />);
    const organismo = await tarjeta('Espacios Verdes');

    await usuario.click(within(organismo).getByRole('button', { name: 'Dar de baja Espacios Verdes' }));
    expect(escrituras()).toEqual([]);
    await usuario.click(within(organismo).getByRole('button', { name: 'Cancelar' }));
    expect(escrituras()).toEqual([]);

    await usuario.click(within(organismo).getByRole('button', { name: 'Dar de baja Espacios Verdes' }));
    await usuario.click(within(organismo).getByRole('button', { name: 'Sí, dar de baja' }));

    expect(await screen.findByText('Espacios Verdes quedó dado de baja.')).toBeInTheDocument();
    expect(escrituras()).toEqual([{ metodo: 'DELETE', ruta: '/api/admin/organismos/2', cuerpo: null }]);
  });

  it('si el servidor rechaza la baja, muestra su motivo', async () => {
    servidor.use(
      http.delete('*/api/admin/organismos/:id', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'ORGANISMO_CON_AREAS_ACTIVAS',
              mensaje: 'Tiene áreas activas (Riego): primero hay que darlas de baja',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderRuta('/administracion/organismos', <PaginaOrganismos />);
    const organismo = await tarjeta('Espacios Verdes');

    await usuario.click(within(organismo).getByRole('button', { name: 'Dar de baja Espacios Verdes' }));
    await usuario.click(within(organismo).getByRole('button', { name: 'Sí, dar de baja' }));

    expect(await within(organismo).findByText(/Tiene áreas activas \(Riego\)/)).toBeInTheDocument();
  });

  it('da de alta un organismo; el nombre es obligatorio', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/organismos', <PaginaOrganismos />);
    await tarjeta('Vialidad');

    await usuario.click(screen.getByRole('button', { name: 'Nuevo organismo' }));
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo organismo' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(within(dialogo).getByText('Es obligatorio')).toBeInTheDocument();
    expect(escrituras()).toEqual([]);

    await usuario.type(within(dialogo).getByLabelText('Nombre'), '  Tránsito ');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Tránsito dado de alta.')).toBeInTheDocument();
    expect(escrituras()).toEqual([
      { metodo: 'POST', ruta: '/api/admin/organismos', cuerpo: { nombre: 'Tránsito', descripcion: null } },
    ]);
  });

  it('un nombre repetido queda marcado en el campo, sin perder lo cargado', async () => {
    servidor.use(
      http.post('*/api/admin/areas', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'NOMBRE_EN_USO',
              mensaje: 'El organismo ya tiene un área con ese nombre',
              detalles: [{ campo: 'nombre', mensaje: 'El organismo ya tiene un área con ese nombre' }],
            },
          },
          { status: 409 },
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderRuta('/administracion/organismos', <PaginaOrganismos />);

    await usuario.click(
      within(await tarjeta('Vialidad')).getByRole('button', { name: 'Nueva área en Vialidad' }),
    );
    const dialogo = screen.getByRole('dialog', { name: 'Nueva área en Vialidad' });
    await usuario.type(within(dialogo).getByLabelText('Nombre'), 'Bacheo');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialogo).findByText('El organismo ya tiene un área con ese nombre'),
    ).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('Bacheo');
  });

  it('reactiva un organismo dado de baja; sus áreas esperan a que se reactive', async () => {
    const usuario = userEvent.setup();
    renderRuta('/administracion/organismos', <PaginaOrganismos />);
    const organismo = await tarjeta('Obras Viejas');

    expect(within(organismo).queryByRole('button', { name: 'Reactivar Cloacas' })).not.toBeInTheDocument();
    expect(
      within(organismo).getByText('Para reactivarla, primero hay que reactivar el organismo.'),
    ).toBeInTheDocument();
    await usuario.click(within(organismo).getByRole('button', { name: 'Reactivar Obras Viejas' }));

    expect(await screen.findByText('Obras Viejas está activo de nuevo.')).toBeInTheDocument();
    expect(escrituras()).toEqual([
      {
        metodo: 'PUT',
        ruta: '/api/admin/organismos/3',
        cuerpo: { nombre: 'Obras Viejas', descripcion: null, activo: true },
      },
    ]);
  });
});
