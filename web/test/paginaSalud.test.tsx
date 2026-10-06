import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
});
