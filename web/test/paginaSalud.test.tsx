import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaSalud } from '../src/funcionalidades/salud/paginaSalud.js';
import { renderRuta } from './apoyo.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

describe('página de salud', () => {
  it('muestra el estado de la API y de la base', async () => {
    servidor.use(http.get('*/api/salud', () => HttpResponse.json({ estado: 'ok', baseDeDatos: 'ok' })));

    renderRuta('/salud', <PaginaSalud />);

    expect(await screen.findByRole('heading', { name: 'Estado del servidor' })).toBeInTheDocument();
    expect(screen.getAllByText('ok')).toHaveLength(2);
  });

  it('muestra en pantalla el mensaje de error del servidor', async () => {
    servidor.use(
      http.get('*/api/salud', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo consultar la base de datos' } },
          { status: 500 },
        ),
      ),
    );

    renderRuta('/salud', <PaginaSalud />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la base de datos');
  });

  it('el botón Reintentar vuelve a consultar', async () => {
    let consultas = 0;
    servidor.use(
      http.get('*/api/salud', () => {
        consultas += 1;
        if (consultas === 1) {
          return HttpResponse.json(
            { error: { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo consultar la base de datos' } },
            { status: 500 },
          );
        }
        return HttpResponse.json({ estado: 'ok', baseDeDatos: 'ok' });
      }),
    );

    renderRuta('/salud', <PaginaSalud />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Estado del servidor' })).toBeInTheDocument();
    expect(consultas).toBe(2);
  });
});
