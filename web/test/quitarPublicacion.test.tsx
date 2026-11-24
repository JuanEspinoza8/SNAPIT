import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Rol } from '../src/compartido/sesion/usuario.js';
import { PaginaReporte } from '../src/funcionalidades/feed/PaginaReporte.js';
import { renderConSesion } from './apoyo.js';

const QUITADO = 'Esta publicación fue eliminada por un administrador. Motivo: Se ve una patente';

let quitado = false;
let pedidos: unknown[] = [];

const servidor = setupServer(
  http.get('*/api/social/reportes/31', () =>
    quitado
      ? HttpResponse.json({ error: { codigo: 'REPORTE_QUITADO', mensaje: QUITADO } }, { status: 410 })
      : HttpResponse.json({
          id: 31,
          incidenteId: 3,
          descripcion: 'Frente al kiosco',
          creadoEn: '2026-10-06T15:15:33.494Z',
          autor: { numero: 1, nombre: 'Vecino 1' },
          fotos: [],
          cantidadMeGusta: 0,
          cantidadComentarios: 0,
          yaMeGusta: false,
        }),
  ),
  http.get('*/api/social/reportes/31/comentarios', () => HttpResponse.json({ comentarios: [] })),
  http.get('*/api/incidentes/3', () => HttpResponse.json({}, { status: 404 })),
  http.delete('*/api/reportes/31', async ({ request }) => {
    pedidos.push(await request.json());
    quitado = true;
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
beforeEach(() => {
  quitado = false;
  pedidos = [];
});
afterEach(() => {
  servidor.resetHandlers();
  localStorage.clear();
});

function conSesion(rol: Rol) {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  servidor.use(
    http.get('*/api/auth/yo', () =>
      HttpResponse.json({
        usuario: { id: 1, email: 'a@b.c', nombre: 'Admin', rol, organismoId: 1, areaId: null },
      }),
    ),
  );
}

const montar = () => renderConSesion('/reporte/31', { '/reporte/:id': <PaginaReporte /> });

describe('quitar una publicación (moderación)', () => {
  it('el administrador la quita con un motivo y la página pasa a decir que se quitó', async () => {
    conSesion('ADMINISTRADOR');
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Quitar publicación' }));
    const ventana = screen.getByRole('dialog', { name: 'Quitar publicación' });
    await usuario.type(within(ventana).getByLabelText('Motivo'), 'Se ve una patente');
    await usuario.click(within(ventana).getByRole('button', { name: 'Quitar publicación' }));

    expect(
      await screen.findByRole('heading', { name: 'Publicación eliminada por un administrador' }),
    ).toBeInTheDocument();
    expect(screen.getByText(QUITADO)).toBeInTheDocument();
    expect(pedidos).toEqual([{ motivo: 'Se ve una patente' }]);
  });

  it('sin motivo no se manda', async () => {
    conSesion('ADMINISTRADOR');
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Quitar publicación' }));
    const ventana = screen.getByRole('dialog', { name: 'Quitar publicación' });
    await usuario.click(within(ventana).getByRole('button', { name: 'Quitar publicación' }));

    expect(within(ventana).getByText('Contá por qué se quita')).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it('un operador o un vecino no ven el botón', async () => {
    conSesion('OPERADOR');
    montar();

    expect(await screen.findByText('Frente al kiosco')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar publicación' })).not.toBeInTheDocument();
  });

  it('un link a una publicación quitada dice que la quitó un administrador, sin sesión también', async () => {
    quitado = true;
    montar();

    expect(
      await screen.findByRole('heading', { name: 'Publicación eliminada por un administrador' }),
    ).toBeInTheDocument();
    expect(screen.getByText(QUITADO)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
