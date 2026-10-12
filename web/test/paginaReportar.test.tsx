import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaReportar } from '../src/funcionalidades/reportar/paginaReportar.js';
import { renderRuta } from './apoyo.js';

// Leaflet no corre en jsdom: el mapa se reemplaza por un botón que marca un punto fijo.
vi.mock('../src/funcionalidades/reportar/MapaElegirPunto.js', () => ({
  MapaElegirPunto: ({ alElegirPunto }: { alElegirPunto: (lat: number, lon: number) => void }) => (
    <button type="button" onClick={() => alElegirPunto(-38.9516, -68.0591)}>
      Marcar el punto
    </button>
  ),
}));

const categorias = {
  categorias: [
    { id: 3, nombre: 'Cordón sin rampa' },
    { id: 4, nombre: 'Luminaria apagada' },
  ],
};

// Lo que el servidor simuló recibir, para revisarlo en los tests.
const enviados: FormData[] = [];

const servidor = setupServer(
  http.get('*/api/categorias', () => HttpResponse.json(categorias)),
  http.post('*/api/reportes', async ({ request }) => {
    enviados.push(await request.formData());
    return HttpResponse.json(
      { id: 1, incidenteId: 1, nivelConfianza: 0, estadoVerificacion: 'PENDIENTE_REVISION' },
      { status: 201 },
    );
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  enviados.length = 0;
});

/** Completa foto, categoría, gravedad, descripción y punto. */
async function completar(usuario: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'Cordón sin rampa' });
  await usuario.upload(screen.getByLabelText('Foto'), new File(['foto'], 'pozo.jpg', { type: 'image/jpeg' }));
  await usuario.selectOptions(screen.getByLabelText('Categoría'), '3');
  await usuario.selectOptions(screen.getByLabelText('Gravedad'), 'GRAVE');
  await usuario.type(screen.getByLabelText('Descripción (opcional)'), 'Pozo grande');
  await usuario.click(screen.getByRole('button', { name: 'Marcar el punto' }));
}

describe('cargar un reporte desde la web', () => {
  it('no envía sin foto ni sin punto, y marca lo que falta', async () => {
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText('Sacá una foto o elegí una de la galería')).toBeInTheDocument();
    expect(screen.getByText('Falta la categoría')).toBeInTheDocument();
    expect(screen.getByText('Falta la gravedad')).toBeInTheDocument();
    expect(screen.getByText('Marcá el punto en el mapa')).toBeInTheDocument();
    expect(enviados).toHaveLength(0);
  });

  it('envía el reporte como SITIO_WEB con todos los campos', async () => {
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);
    await completar(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByRole('heading', { name: 'Reporte enviado' })).toBeInTheDocument();
    expect(enviados).toHaveLength(1);
    const formulario = enviados[0]!;
    expect(formulario.get('origen')).toBe('SITIO_WEB');
    expect(formulario.get('categoriaId')).toBe('3');
    expect(formulario.get('severidadDeclarada')).toBe('GRAVE');
    expect(formulario.get('descripcion')).toBe('Pozo grande');
    expect(formulario.get('lat')).toBe('-38.9516');
    expect(formulario.get('lon')).toBe('-68.0591');
    // El nombre puede llegar como "blob" (jsdom no lo conserva): alcanza con que la foto haya viajado.
    const foto = formulario.get('foto') as Blob;
    expect(foto.size).toBeGreaterThan(0);
  });

  it('si el servidor rechaza, muestra el error y conserva lo cargado', async () => {
    servidor.use(
      http.post('*/api/reportes', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'categoriaId', mensaje: 'La categoría no existe' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);
    await completar(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText('La categoría no existe')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reporte enviado' })).not.toBeInTheDocument();
    // Lo cargado sigue en pantalla.
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Pozo grande');
    expect(screen.getByLabelText('Categoría')).toHaveValue('3');
  });
});
