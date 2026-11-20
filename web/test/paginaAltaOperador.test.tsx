import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaAltaOperador } from '../src/funcionalidades/administracion/paginaAltaOperador.js';
import type { Usuario } from '../src/compartido/sesion/usuario.js';
import { renderRuta } from './apoyo.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

const organismo = {
  id: 1,
  nombre: 'Municipalidad de Neuquén',
  areas: [
    { id: 1, nombre: 'Bacheo' },
    { id: 2, nombre: 'Veredas' },
  ],
};

const operadorActual: Usuario = {
  id: 3,
  email: 'bacheo@ejemplo.com',
  nombre: 'Operador de Bacheo',
  rol: 'OPERADOR',
  organismoId: 1,
  areaId: 1,
};

function conTodo(usuarios = [operadorActual]) {
  servidor.use(
    http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
    http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios })),
  );
}

async function llenarOperador(persona = userEvent.setup()) {
  // Los organismos llegan de la API: hay que esperarlos antes de elegir.
  await screen.findByRole('option', { name: 'Municipalidad de Neuquén' });
  await persona.type(screen.getByLabelText('Nombre'), 'Olga');
  await persona.type(screen.getByLabelText('Correo'), 'olga@ejemplo.com');
  await persona.type(screen.getByLabelText('Clave inicial'), 'clave-inicial-1');
  await persona.selectOptions(screen.getByLabelText('Organismo'), '1');
  await persona.selectOptions(screen.getByLabelText('Área (opcional)'), '1');
}

describe('alta de operadores', () => {
  it('carga los organismos y las áreas del organismo elegido', async () => {
    conTodo();
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await screen.findByRole('option', { name: 'Municipalidad de Neuquén' });
    await persona.selectOptions(screen.getByLabelText('Organismo'), '1');

    expect(screen.getByLabelText('Área (opcional)')).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Bacheo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Veredas' })).toBeInTheDocument();
  });

  it('da de alta a un operador, limpia el form y refresca la lista', async () => {
    let lista = [operadorActual];
    let cuerpo: Record<string, unknown> | null = null;
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: lista })),
      http.post('*/api/admin/usuarios', async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>;
        const creado: Usuario = {
          id: 4,
          email: String(cuerpo.email),
          nombre: String(cuerpo.nombre),
          rol: 'OPERADOR',
          organismoId: Number(cuerpo.organismoId),
          areaId: Number(cuerpo.areaId),
        };
        lista = [...lista, creado];
        return HttpResponse.json({ usuario: creado }, { status: 201 });
      }),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(persona);
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText(/Operador dado de alta/)).toBeInTheDocument();
    expect(cuerpo).toEqual({
      email: 'olga@ejemplo.com',
      clave: 'clave-inicial-1',
      nombre: 'Olga',
      rol: 'OPERADOR',
      organismoId: 1,
      areaId: 1,
    });
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByLabelText('Correo')).toHaveValue('');
    expect(screen.getByLabelText('Clave inicial')).toHaveValue('');
    expect(await screen.findByText('olga@ejemplo.com')).toBeInTheDocument();
  });

  it('un operador puede quedar sin área: se manda sin área', async () => {
    conTodo();
    const enviados: unknown[] = [];
    servidor.use(
      http.post('*/api/admin/usuarios', async ({ request }) => {
        enviados.push(await request.json());
        return HttpResponse.json({ usuario: { ...operadorActual, areaId: null } }, { status: 201 });
      }),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await screen.findByRole('option', { name: 'Municipalidad de Neuquén' });
    await persona.type(screen.getByLabelText('Nombre'), 'Olga');
    await persona.type(screen.getByLabelText('Correo'), 'olga@ejemplo.com');
    await persona.type(screen.getByLabelText('Clave inicial'), 'clave-inicial-1');
    await persona.selectOptions(screen.getByLabelText('Organismo'), '1');
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toMatchObject({ rol: 'OPERADOR', organismoId: 1, areaId: null });
  });

  it('muestra el detalle del servidor en su campo sin perder lo cargado', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
      http.post('*/api/admin/usuarios', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'areaId', mensaje: 'El área no pertenece a ese organismo' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(persona);
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(screen.getByText('El área no pertenece a ese organismo')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Olga');
    expect(screen.getByLabelText('Correo')).toHaveValue('olga@ejemplo.com');
    expect(screen.getByLabelText('Clave inicial')).toHaveValue('clave-inicial-1');
  });

  it('un correo en uso se marca sobre el campo y no aparece el aviso general', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
      http.post('*/api/admin/usuarios', () =>
        HttpResponse.json(
          { error: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya hay una cuenta con ese correo' } },
          { status: 409 },
        ),
      ),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(persona);
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText('Ya hay una cuenta con ese correo')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveValue('olga@ejemplo.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un administrador no pide área y puede quedar sin organismo', async () => {
    let cuerpo: Record<string, unknown> | null = null;
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
      http.post('*/api/admin/usuarios', async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>;
        const creado: Usuario = {
          id: 5,
          email: String(cuerpo.email),
          nombre: String(cuerpo.nombre),
          rol: 'ADMINISTRADOR',
          organismoId: null,
          areaId: null,
        };
        return HttpResponse.json({ usuario: creado }, { status: 201 });
      }),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await persona.selectOptions(screen.getByLabelText('Rol'), 'ADMINISTRADOR');
    expect(screen.queryByLabelText('Área')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Organismo (opcional)')).toBeInTheDocument();

    await persona.type(screen.getByLabelText('Nombre'), 'Ana');
    await persona.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await persona.type(screen.getByLabelText('Clave inicial'), 'clave-inicial-1');
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText(/Administrador dado de alta/)).toBeInTheDocument();
    expect(cuerpo).toEqual({
      email: 'ana@ejemplo.com',
      clave: 'clave-inicial-1',
      nombre: 'Ana',
      rol: 'ADMINISTRADOR',
      organismoId: null,
      areaId: null,
    });
  });

  it('muestra la lista de usuarios con el rol y su organismo', async () => {
    const admin: Usuario = {
      id: 1,
      email: 'admin@ejemplo.com',
      nombre: 'Administración Municipal',
      rol: 'ADMINISTRADOR',
      organismoId: 1,
      areaId: null,
    };
    conTodo([admin, operadorActual]);
    renderRuta('/administracion', <PaginaAltaOperador />);

    const filaAdmin = (await screen.findByText('admin@ejemplo.com')).closest('li')!;
    expect(within(filaAdmin).getByText('Administración Municipal')).toBeInTheDocument();
    expect(within(filaAdmin).getByText('Administrador')).toBeInTheDocument();
    expect(within(filaAdmin).getByText(/Municipalidad de Neuquén/)).toBeInTheDocument();

    const filaOperador = screen.getByText('bacheo@ejemplo.com').closest('li')!;
    expect(within(filaOperador).getByText('Operador de Bacheo')).toBeInTheDocument();
    expect(within(filaOperador).getByText('Operador')).toBeInTheDocument();
    expect(within(filaOperador).getByText('Municipalidad de Neuquén · Bacheo')).toBeInTheDocument();
  });

  it('si los organismos no cargan, se ve el aviso con reintentar', async () => {
    servidor.use(
      http.get('*/api/admin/organismos', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error del servidor' } },
          { status: 500 },
        ),
      ),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
    );
    renderRuta('/administracion', <PaginaAltaOperador />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo|Error/i);
  });

  it('al cambiar de organismo se olvida el área del anterior', async () => {
    const otro = { id: 2, nombre: 'Ente Provincial de Energía', areas: [{ id: 7, nombre: 'Redes' }] };
    const enviados: unknown[] = [];
    servidor.use(
      http.get('*/api/admin/organismos', () => HttpResponse.json({ organismos: [organismo, otro] })),
      http.get('*/api/admin/usuarios', () => HttpResponse.json({ usuarios: [operadorActual] })),
      http.post('*/api/admin/usuarios', async ({ request }) => {
        enviados.push(await request.json());
        return HttpResponse.json({ usuario: operadorActual }, { status: 201 });
      }),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(persona);
    await persona.selectOptions(screen.getByLabelText('Organismo'), '2');

    expect(screen.getByLabelText('Área (opcional)')).toHaveValue('');
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));

    // El área de Bacheo era del otro organismo: sale sin área.
    await waitFor(() =>
      expect(enviados).toEqual([expect.objectContaining({ organismoId: 2, areaId: null })]),
    );
  });

  it('un error en un campo que la pantalla no tiene se ve en el aviso general', async () => {
    conTodo();
    servidor.use(
      http.post('*/api/admin/usuarios', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'rol', mensaje: 'Tiene que ser OPERADOR o ADMINISTRADOR' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(persona);
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Hay datos inválidos');
    expect(aviso).toHaveTextContent('Tiene que ser OPERADOR o ADMINISTRADOR');
  });

  it('el aviso de alta dice el rol creado y se va al cargar el siguiente', async () => {
    conTodo();
    servidor.use(
      http.post('*/api/admin/usuarios', () =>
        HttpResponse.json(
          {
            usuario: {
              id: 4,
              email: 'olga@ejemplo.com',
              nombre: 'Olga',
              rol: 'OPERADOR',
              organismoId: 1,
              areaId: 1,
            },
          },
          { status: 201 },
        ),
      ),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await llenarOperador(persona);
    await persona.click(screen.getByRole('button', { name: 'Dar de alta' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Operador dado de alta');

    await persona.selectOptions(screen.getByLabelText('Rol'), 'ADMINISTRADOR');

    expect(screen.queryByText(/dado de alta/)).not.toBeInTheDocument();
  });

  it('en la lista, un área o un organismo desactivados se nombran como tales', async () => {
    const deAreaInactiva: Usuario = { ...operadorActual, id: 5, email: 'viejo@ejemplo.com', areaId: 9 };
    const deOrganismoInactivo: Usuario = {
      ...operadorActual,
      id: 6,
      email: 'otro@ejemplo.com',
      organismoId: 8,
      areaId: 9,
    };
    conTodo([deAreaInactiva, deOrganismoInactivo]);
    renderRuta('/administracion', <PaginaAltaOperador />);

    const filaArea = (await screen.findByText('viejo@ejemplo.com')).closest('li')!;
    expect(await within(filaArea).findByText('Municipalidad de Neuquén · área inactiva')).toBeInTheDocument();
    const filaOrganismo = screen.getByText('otro@ejemplo.com').closest('li')!;
    expect(within(filaOrganismo).getByText('Organismo inactivo')).toBeInTheDocument();
  });
});

describe('editar y dar de baja usuarios', () => {
  const vecino: Usuario = {
    id: 7,
    email: 'vecina@ejemplo.com',
    nombre: 'Vecina',
    rol: 'VECINO',
    organismoId: null,
    areaId: null,
  };

  it('edita el rol y dónde trabaja, avisando que se cierran sus sesiones', async () => {
    conTodo([vecino]);
    const modificaciones: { id: string; cuerpo: unknown }[] = [];
    servidor.use(
      http.put('*/api/admin/usuarios/:id', async ({ params, request }) => {
        modificaciones.push({ id: String(params.id), cuerpo: await request.json() });
        return HttpResponse.json({ usuario: { ...vecino, rol: 'OPERADOR', organismoId: 1 } });
      }),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await persona.click(await screen.findByRole('button', { name: 'Editar a Vecina' }));
    const ventana = screen.getByRole('dialog', { name: 'Editar a Vecina' });
    await persona.selectOptions(within(ventana).getByLabelText('Rol'), 'OPERADOR');
    await persona.selectOptions(within(ventana).getByLabelText('Organismo'), '1');
    await persona.selectOptions(within(ventana).getByLabelText('Área (opcional)'), '2');
    expect(within(ventana).getByText(/se cierran sus sesiones/)).toBeInTheDocument();
    await persona.click(within(ventana).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(modificaciones).toEqual([
      { id: '7', cuerpo: { nombre: 'Vecina', rol: 'OPERADOR', organismoId: 1, areaId: 2 } },
    ]);
  });

  it('un error del servidor se ve en la ventana, sin cerrarla', async () => {
    conTodo([vecino]);
    servidor.use(
      http.put('*/api/admin/usuarios/:id', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'ULTIMO_ADMINISTRADOR',
              mensaje: 'Es el único administrador: no puede dejar de serlo',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await persona.click(await screen.findByRole('button', { name: 'Editar a Vecina' }));
    const ventana = screen.getByRole('dialog', { name: 'Editar a Vecina' });
    await persona.click(within(ventana).getByRole('button', { name: 'Guardar' }));

    expect(await within(ventana).findByText(/Es el único administrador/)).toBeInTheDocument();
  });

  it('dar de baja pide confirmación y después la manda', async () => {
    conTodo([vecino]);
    const bajas: string[] = [];
    servidor.use(
      http.delete('*/api/admin/usuarios/:id', ({ params }) => {
        bajas.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const persona = userEvent.setup();
    renderRuta('/administracion', <PaginaAltaOperador />);

    await persona.click(await screen.findByRole('button', { name: 'Dar de baja a Vecina' }));
    expect(screen.getByText(/No va a poder ingresar/)).toBeInTheDocument();
    // El foco va a la confirmación y, al cancelar, vuelve al botón que la abrió.
    expect(screen.getByRole('button', { name: 'Sí, dar de baja' })).toHaveFocus();
    await persona.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(bajas).toEqual([]);
    expect(screen.getByRole('button', { name: 'Dar de baja a Vecina' })).toHaveFocus();

    await persona.click(screen.getByRole('button', { name: 'Dar de baja a Vecina' }));
    await persona.click(screen.getByRole('button', { name: 'Sí, dar de baja' }));
    await waitFor(() => expect(bajas).toEqual(['7']));
  });
});
