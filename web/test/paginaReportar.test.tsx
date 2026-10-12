import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
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

// Los formularios que salieron hacia el servidor, para revisarlos en los tests.
const enviados: FormData[] = [];

const servidor = setupServer(
  http.get('*/api/categorias', () => HttpResponse.json(categorias)),
  http.post('*/api/reportes', () =>
    HttpResponse.json(
      { id: 1, incidenteId: 1, nivelConfianza: 0, estadoVerificacion: 'PENDIENTE_REVISION' },
      { status: 201 },
    ),
  ),
);

beforeAll(() => {
  servidor.listen();
  // Se guarda el FormData antes de que salga: en jsdom, leer en el handler un cuerpo con un
  // archivo (request.formData()) no termina nunca.
  const fetchOriginal = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, init) => {
    if (init?.body instanceof FormData) enviados.push(init.body);
    return fetchOriginal(entrada, init);
  });
});
afterAll(() => {
  servidor.close();
  vi.restoreAllMocks();
});
afterEach(() => {
  servidor.resetHandlers();
  enviados.length = 0;
});

/** En /mapa muestra con qué estado llegó la navegación, para ver qué le pasa «Ver en el mapa». */
function DestinoMapa() {
  const { state } = useLocation();
  return <p>Mapa con {JSON.stringify(state)}</p>;
}

function renderReportarYMapa() {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <MemoryRouter initialEntries={['/reportar']}>
          <Routes>
            <Route path="/reportar" element={<PaginaReportar />} />
            <Route path="/mapa" element={<DestinoMapa />} />
          </Routes>
        </MemoryRouter>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

const respuestaCreado = (estadoVerificacion: string) =>
  HttpResponse.json({ id: 1, incidenteId: 1, nivelConfianza: 80, estadoVerificacion }, { status: 201 });

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

    expect(await screen.findByText('Elegí una foto del problema')).toBeInTheDocument();
    expect(screen.getByText('Falta la categoría')).toBeInTheDocument();
    expect(screen.getByText('Falta la gravedad')).toBeInTheDocument();
    expect(screen.getByText('Marcá el punto en el mapa')).toBeInTheDocument();
    expect(enviados).toHaveLength(0);
  });

  it('con todo cargado menos el punto, no envía', async () => {
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);
    await screen.findByRole('option', { name: 'Cordón sin rampa' });
    await usuario.upload(
      screen.getByLabelText('Foto'),
      new File(['foto'], 'pozo.jpg', { type: 'image/jpeg' }),
    );
    await usuario.selectOptions(screen.getByLabelText('Categoría'), '3');
    await usuario.selectOptions(screen.getByLabelText('Gravedad'), 'GRAVE');

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText('Marcá el punto en el mapa')).toBeInTheDocument();
    expect(screen.queryByText('Elegí una foto del problema')).not.toBeInTheDocument();
    expect(enviados).toHaveLength(0);
  });

  it('una foto que no es JPG ni PNG se rechaza al elegirla', async () => {
    // Sin applyAccept: false, user-event descarta el archivo por el accept del input.
    const usuario = userEvent.setup({ applyAccept: false });
    renderRuta('/reportar', <PaginaReportar />);

    await usuario.upload(
      screen.getByLabelText('Foto'),
      new File(['foto'], 'pozo.gif', { type: 'image/gif' }),
    );

    expect(await screen.findByText('Tiene que ser una foto JPG o PNG')).toBeInTheDocument();
    expect(screen.queryByAltText('Vista previa de la foto del problema')).not.toBeInTheDocument();
  });

  it('si no hay categorías, avisa que no se puede reportar', async () => {
    servidor.use(http.get('*/api/categorias', () => HttpResponse.json({ categorias: [] })));
    renderRuta('/reportar', <PaginaReportar />);

    expect(
      await screen.findByText(
        'Todavía no hay categorías cargadas, así que no se puede reportar. Probá más tarde.',
      ),
    ).toBeInTheDocument();
  });

  it('envía el reporte como SITIO_WEB con todos los campos', async () => {
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);
    await completar(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByRole('heading', { name: 'Reporte enviado' })).toBeInTheDocument();
    expect(
      screen.getByText('Ya está en el mapa y queda pendiente de revisión hasta que se verifique.'),
    ).toBeInTheDocument();
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

  it('si el reporte llega verificado, lo dice', async () => {
    servidor.use(http.post('*/api/reportes', () => respuestaCreado('VERIFICADO')));
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);
    await completar(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText('Se verificó y ya está en el mapa.')).toBeInTheDocument();
  });

  it('«Ver en el mapa» lleva al mapa con el punto del reporte', async () => {
    const usuario = userEvent.setup();
    renderReportarYMapa();
    await completar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await usuario.click(await screen.findByRole('link', { name: 'Ver en el mapa' }));

    expect(await screen.findByText('Mapa con {"foco":{"lat":-38.9516,"lon":-68.0591}}')).toBeInTheDocument();
  });

  it('una foto de más de 20 MB se rechaza al elegirla', async () => {
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);
    const pesada = new File(['foto'], 'pozo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(pesada, 'size', { value: 21 * 1024 * 1024 });

    await usuario.upload(screen.getByLabelText('Foto'), pesada);

    expect(await screen.findByText('Pesa demasiado: elegí una foto de hasta 20 MB')).toBeInTheDocument();
    expect(screen.queryByAltText('Vista previa de la foto del problema')).not.toBeInTheDocument();
  });

  it('si nginx la corta por pesada (413), lo dice debajo de la foto', async () => {
    servidor.use(
      http.post(
        '*/api/reportes',
        () => new HttpResponse('<html>413 Request Entity Too Large</html>', { status: 413 }),
      ),
    );
    const usuario = userEvent.setup();
    renderRuta('/reportar', <PaginaReportar />);
    await completar(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText('El archivo pesa demasiado para enviarlo.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Pozo grande');
  });
});
