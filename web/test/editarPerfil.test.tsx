import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaPerfil } from '../src/funcionalidades/perfil/PaginaPerfil.js';
import { renderConSesion } from './apoyo.js';

const ana = {
  id: 5,
  email: 'ana@ejemplo.com',
  nombre: 'Ana Vecina',
  rol: 'VECINO',
  organismoId: null,
  areaId: null,
  creadoEn: '2026-02-10T15:00:00.000Z',
};

let pedidos: { ruta: string; cuerpo: unknown }[] = [];

const servidor = setupServer(
  http.get('*/api/auth/yo', () => HttpResponse.json({ usuario: ana })),
  http.get('*/api/reportes/mios', () => HttpResponse.json({ reportes: [] })),
  http.patch('*/api/usuarios/yo', async ({ request }) => {
    const cuerpo = (await request.json()) as { nombre: string };
    pedidos.push({ ruta: 'usuarios/yo', cuerpo });
    return HttpResponse.json({ usuario: { ...ana, nombre: cuerpo.nombre } });
  }),
  http.post('*/api/auth/cambiar-clave', async ({ request }) => {
    const cuerpo = (await request.json()) as { claveActual: string };
    pedidos.push({ ruta: 'cambiar-clave', cuerpo });
    if (cuerpo.claveActual !== 'la-de-ahora') {
      return HttpResponse.json(
        {
          error: {
            codigo: 'DATOS_INVALIDOS',
            mensaje: 'Hay datos inválidos',
            detalles: [{ campo: 'claveActual', mensaje: 'No es tu contraseña actual' }],
          },
        },
        { status: 400 },
      );
    }
    return HttpResponse.json({
      tokenAcceso: 'acceso-nuevo',
      tokenRenovacion: 'renovacion-nueva',
      usuario: ana,
    });
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
beforeEach(() => {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  pedidos = [];
});
afterEach(() => servidor.resetHandlers());

async function abrirEdicion() {
  const usuario = userEvent.setup();
  renderConSesion('/perfil', { '/perfil': <PaginaPerfil /> });
  await usuario.click(await screen.findByRole('button', { name: 'Editar perfil' }));
  return { usuario, ventana: screen.getByRole('dialog', { name: 'Editar perfil' }) };
}

describe('perfil: datos de la cuenta', () => {
  it('muestra desde cuándo es miembro y cuántos reportes hizo', async () => {
    renderConSesion('/perfil', { '/perfil': <PaginaPerfil /> });

    expect(await screen.findByText('Miembro desde febrero de 2026')).toBeInTheDocument();
    expect(await screen.findByText('reportes')).toHaveTextContent('reportes');
    expect(screen.getByRole('button', { name: 'Editar perfil' })).toBeInTheDocument();
  });
});

describe('editar perfil', () => {
  it('cambia el nombre y se ve enseguida arriba', async () => {
    const { usuario, ventana } = await abrirEdicion();

    const nombre = within(ventana).getByLabelText('Nombre visible');
    await usuario.clear(nombre);
    await usuario.type(nombre, 'Ana Pérez');
    await usuario.click(within(ventana).getByRole('button', { name: 'Guardar nombre' }));

    expect(await within(ventana).findByText('Listo, se guardó.')).toBeInTheDocument();
    expect(pedidos).toEqual([{ ruta: 'usuarios/yo', cuerpo: { nombre: 'Ana Pérez' } }]);
    expect(screen.getByRole('heading', { name: 'Ana Pérez', level: 1 })).toBeInTheDocument();
  });

  it('un nombre vacío no se manda', async () => {
    const { usuario, ventana } = await abrirEdicion();

    await usuario.clear(within(ventana).getByLabelText('Nombre visible'));
    await usuario.type(within(ventana).getByLabelText('Nombre visible'), '   ');
    await usuario.click(within(ventana).getByRole('button', { name: 'Guardar nombre' }));

    expect(pedidos).toEqual([]);
  });

  it('cambia la contraseña y guarda los tokens nuevos para seguir adentro', async () => {
    const { usuario, ventana } = await abrirEdicion();

    await usuario.type(within(ventana).getByLabelText('Contraseña actual'), 'la-de-ahora');
    await usuario.type(within(ventana).getByLabelText('Contraseña nueva'), 'la-nueva-123');
    await usuario.type(within(ventana).getByLabelText('Repetí la contraseña nueva'), 'la-nueva-123');
    await usuario.click(within(ventana).getByRole('button', { name: 'Cambiar contraseña' }));

    expect(
      await within(ventana).findByText(/Se cerró la sesión en los otros dispositivos/),
    ).toBeInTheDocument();
    expect(pedidos).toEqual([
      { ruta: 'cambiar-clave', cuerpo: { claveActual: 'la-de-ahora', claveNueva: 'la-nueva-123' } },
    ]);
    expect(localStorage.getItem('snapit:tokenAcceso')).toBe('acceso-nuevo');
    expect(localStorage.getItem('snapit:tokenRenovacion')).toBe('renovacion-nueva');
  });

  it('si la nueva no coincide con la repetida, lo dice sin mandar nada', async () => {
    const { usuario, ventana } = await abrirEdicion();

    await usuario.type(within(ventana).getByLabelText('Contraseña actual'), 'la-de-ahora');
    await usuario.type(within(ventana).getByLabelText('Contraseña nueva'), 'la-nueva-123');
    await usuario.type(within(ventana).getByLabelText('Repetí la contraseña nueva'), 'otra-cosa-123');
    await usuario.click(within(ventana).getByRole('button', { name: 'Cambiar contraseña' }));

    expect(within(ventana).getByText('No coincide con la nueva')).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it('si la actual no es correcta, el error aparece en ese campo', async () => {
    const { usuario, ventana } = await abrirEdicion();

    await usuario.type(within(ventana).getByLabelText('Contraseña actual'), 'no-es-esta');
    await usuario.type(within(ventana).getByLabelText('Contraseña nueva'), 'la-nueva-123');
    await usuario.type(within(ventana).getByLabelText('Repetí la contraseña nueva'), 'la-nueva-123');
    await usuario.click(within(ventana).getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await within(ventana).findByText('No es tu contraseña actual')).toBeInTheDocument();
    expect(localStorage.getItem('snapit:tokenAcceso')).toBe('acceso');
  });
});
