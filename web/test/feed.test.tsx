import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { haceCuanto } from '../src/compartido/formato/fechas.js';
import type { Rol } from '../src/compartido/sesion/usuario.js';
import { PaginaIncidente } from '../src/funcionalidades/feed/PaginaIncidente.js';
import { PaginaInicio } from '../src/funcionalidades/feed/PaginaInicio.js';
import { PaginaReporte } from '../src/funcionalidades/feed/PaginaReporte.js';
import type { Comentario, Publicacion, ReportePublico } from '../src/funcionalidades/feed/tipos.js';
import { renderConSesion, renderRuta } from './apoyo.js';

// Leaflet necesita medir la pantalla y jsdom no la dibuja: el mapa chico se reemplaza por una lista.
vi.mock('../src/funcionalidades/feed/MapaPuntos.js', () => ({
  MapaPuntos: ({ puntos }: { puntos: { id: number; titulo: string }[] }) => (
    <ul aria-label="Mapa simulado">
      {puntos.map((p) => (
        <li key={p.id}>{p.titulo}</li>
      ))}
    </ul>
  ),
}));

const API = 'http://localhost:3000/api';

// Del autor solo llega su número en el incidente (docs/api.md, sección «Social»).
const vecino1 = { numero: 1, nombre: 'Vecino 1', sistema: false };
const vecino2 = { numero: 2, nombre: 'Vecino 2', sistema: false };
const snapit = { numero: null, nombre: 'SnapIt', sistema: true };

const publicacion = (id: number, cambios: Partial<Publicacion> = {}): Publicacion => ({
  id,
  incidenteId: id * 100,
  descripcion: null,
  creadoEn: '2026-10-06T15:15:33.494Z',
  autor: vecino1,
  fotos: [{ id: id * 10, url: `/api/fotos/${id * 10}` }],
  cantidadMeGusta: 0,
  cantidadComentarios: 0,
  yaMeGusta: false,
  categoria: { id: 1, nombre: 'Bache' },
  severidad: 'MODERADA',
  direccion: 'Lanín 120, Villa Ceferino',
  lat: -38.95,
  lon: -68.06,
  derivadoA: { id: 4, nombre: 'Bacheo' },
  incidente: { id: id * 100, estado: 'VERIFICADO', resueltoEn: null, cantidadVecinos: 1 },
  ...cambios,
});

const reporte = (cambios: Partial<ReportePublico> = {}): ReportePublico => ({
  id: 31,
  incidenteId: 3,
  descripcion: 'Frente al kiosco',
  creadoEn: '2026-10-06T15:15:33.494Z',
  autor: vecino1,
  fotos: [{ id: 31, url: '/api/fotos/31' }],
  cantidadMeGusta: 5,
  cantidadComentarios: 1,
  yaMeGusta: false,
  ...cambios,
});

const comentario = (id: number, cambios: Partial<Comentario> = {}): Comentario => ({
  id,
  texto: 'Confirmo, sigue igual',
  creadoEn: '2026-10-07T15:15:33.494Z',
  editadoEn: null,
  autor: vecino2,
  esMio: false,
  ...cambios,
});

/** La ficha del incidente 3 (`GET /api/incidentes/3`), que la publicación muestra como «el problema». */
const fichaDelProblema = (cantidadVecinos = 1) => ({
  id: 3,
  lat: -38.95,
  lon: -68.06,
  categoria: { id: 2, nombre: 'Vereda rota' },
  estado: 'DERIVADO',
  enRevision: false,
  severidad: 'GRAVE',
  primerReporteEn: '2026-10-06T15:15:33.494Z',
  cantidadReportes: cantidadVecinos,
  cantidadVecinos,
  direccion: 'Lanín 120, Villa Ceferino',
  fotos: [{ id: 31, url: '/api/fotos/31' }],
  fotoCierre: null,
  resueltoEn: null,
  derivadoA: { id: 2, nombre: 'Veredas' },
});

const servidor = setupServer();
beforeAll(() => servidor.listen());
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

/** Deja una sesión de ese rol: los tokens en localStorage y `/auth/yo` simulado. */
function ingresarComo(rol: Rol) {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  servidor.use(
    http.get('*/api/auth/yo', () =>
      HttpResponse.json({
        usuario: { id: 1, email: 'x@ejemplo.com', nombre: 'Nombre', rol, organismoId: null, areaId: null },
      }),
    ),
  );
}

const errorDelServidor = () =>
  HttpResponse.json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Algo salió mal' } }, { status: 500 });

/** El feed en dos páginas: la primera sin cursor y la segunda con `c1`. */
function feedEnDosPaginas() {
  const cursores: (string | null)[] = [];
  servidor.use(
    http.get(`${API}/social/feed`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      cursores.push(cursor);
      return cursor === 'c1'
        ? HttpResponse.json({
            reportes: [publicacion(3, { categoria: { id: 2, nombre: 'Vereda rota' } })],
            siguiente: null,
          })
        : HttpResponse.json({
            reportes: [
              publicacion(1, {
                severidad: 'GRAVE',
                cantidadMeGusta: 7,
                cantidadComentarios: 4,
                descripcion: 'Pozo enorme',
              }),
              publicacion(2, {
                categoria: { id: 3, nombre: 'Cordón sin rampa' },
                autor: vecino2,
                incidente: { id: 200, estado: 'EN_EJECUCION', resueltoEn: null, cantidadVecinos: 3 },
              }),
            ],
            siguiente: 'c1',
          });
    }),
  );
  return cursores;
}

describe('inicio: el feed de publicaciones', () => {
  it('muestra cada reporte publicado como un posteo, con la línea a su problema', async () => {
    feedEnDosPaginas();
    renderRuta('/', <PaginaInicio />);

    const bache = await screen.findByRole('article', { name: 'Bache, reporte del Vecino 1' });
    expect(within(bache).getByText('Vecino 1')).toBeInTheDocument();
    expect(within(bache).getByRole('img', { name: /Foto 1 de 1 de Bache/ })).toHaveAttribute(
      'src',
      `${API}/fotos/10`,
    );
    expect(within(bache).getByText('Grave')).toBeInTheDocument();
    expect(within(bache).getByText('Pozo enorme')).toBeInTheDocument();
    expect(within(bache).getByText(/Derivado al área de/)).toHaveTextContent('Derivado al área de Bacheo');
    expect(within(bache).getByRole('button', { name: 'Me gusta (7 me gusta)' })).toBeInTheDocument();
    expect(within(bache).getByRole('link', { name: 'Ver 4 comentarios' })).toHaveAttribute(
      'href',
      '/reporte/1',
    );
    // Un solo vecino: el problema ya está en la publicación, la línea solo dice su estado.
    expect(within(bache).getByText('Estado del problema')).toBeInTheDocument();
    expect(within(bache).queryByRole('link', { name: /problema/ })).not.toBeInTheDocument();

    // El mismo problema lo reportaron tres vecinos: lo dice la línea a su incidente, con su estado.
    const cordon = screen.getByRole('article', { name: 'Cordón sin rampa, reporte del Vecino 2' });
    const linea = within(cordon).getByRole('link', { name: /3 vecinos reportaron este problema/ });
    expect(linea).toHaveAttribute('href', '/incidente/200');
    expect(linea).toHaveTextContent('En ejecución');
  });

  it('toda la tarjeta abre la publicación, pero el me gusta hace lo suyo', async () => {
    ingresarComo('VECINO');
    const meGusta: string[] = [];
    servidor.use(
      http.get(`${API}/social/feed`, () =>
        HttpResponse.json({ reportes: [publicacion(1, { descripcion: 'Pozo enorme' })], siguiente: null }),
      ),
      http.post(`${API}/social/reportes/1/me-gusta`, () => {
        meGusta.push('POST');
        return HttpResponse.json({ reporteId: 1, cantidadMeGusta: 1, yaMeGusta: true });
      }),
    );
    renderConSesion('/', { '/': <PaginaInicio />, '/reporte/:id': <p>Detalle del reporte</p> });

    await userEvent.click(await screen.findByRole('button', { name: 'Me gusta (0 me gusta)' }));
    expect(meGusta).toEqual(['POST']);
    expect(screen.queryByText('Detalle del reporte')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Pozo enorme'));
    expect(await screen.findByText('Detalle del reporte')).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/reporte/1');
  });

  it('un problema resuelto lo dice arriba de la publicación', async () => {
    servidor.use(
      http.get(`${API}/social/feed`, () =>
        HttpResponse.json({
          reportes: [
            publicacion(1, {
              incidente: {
                id: 100,
                estado: 'RESUELTO',
                resueltoEn: '2026-11-05T15:00:00.000Z',
                cantidadVecinos: 1,
              },
            }),
          ],
          siguiente: null,
        }),
      ),
    );
    renderRuta('/', <PaginaInicio />);

    const articulo = await screen.findByRole('article', { name: 'Bache, reporte del Vecino 1' });
    expect(within(articulo).getByText('✓ Resuelto')).toBeInTheDocument();
  });

  it('ofrece reportar un problema, también sin sesión', async () => {
    feedEnDosPaginas();
    renderRuta('/', <PaginaInicio />);

    expect(await screen.findByRole('link', { name: 'Reportar' })).toHaveAttribute('href', '/reportar');
  });

  it('«Cargar más» pide la página siguiente con el cursor y avisa cuando no hay más', async () => {
    const cursores = feedEnDosPaginas();
    renderRuta('/', <PaginaInicio />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));

    expect(
      await screen.findByRole('article', { name: 'Vereda rota, reporte del Vecino 1' }),
    ).toBeInTheDocument();
    expect(cursores).toEqual([null, 'c1']);
    expect(screen.getByText('No hay más publicaciones por ahora')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('si no carga, lo dice y deja reintentar', async () => {
    let falla = true;
    servidor.use(
      http.get(`${API}/social/feed`, () =>
        falla ? errorDelServidor() : HttpResponse.json({ reportes: [publicacion(1)], siguiente: null }),
      ),
    );
    renderRuta('/', <PaginaInicio />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
    falla = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article', { name: 'Bache, reporte del Vecino 1' })).toBeInTheDocument();
  });

  it('sin publicaciones muestra un mensaje', async () => {
    servidor.use(http.get(`${API}/social/feed`, () => HttpResponse.json({ reportes: [], siguiente: null })));
    renderRuta('/', <PaginaInicio />);

    expect(await screen.findByText('Todavía no hay publicaciones')).toBeInTheDocument();
  });

  it('el carrusel pasa las fotos con las flechas', async () => {
    servidor.use(
      http.get(`${API}/social/feed`, () =>
        HttpResponse.json({
          reportes: [
            publicacion(1, {
              fotos: [
                { id: 11, url: '/api/fotos/11' },
                { id: 12, url: '/api/fotos/12' },
              ],
            }),
          ],
          siguiente: null,
        }),
      ),
    );
    renderRuta('/', <PaginaInicio />);

    expect(await screen.findByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }));

    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto siguiente' })).toBeDisabled();
  });
});

describe('me gusta', () => {
  /** El feed con una publicación cuyo me gusta cambia cuando el servidor lo recibe. */
  function feedConMeGusta(responder?: () => Response) {
    let dado = false;
    const pedidos: string[] = [];
    servidor.use(
      http.get(`${API}/social/feed`, () =>
        HttpResponse.json({
          reportes: [publicacion(1, { yaMeGusta: dado, cantidadMeGusta: dado ? 3 : 2 })],
          siguiente: null,
        }),
      ),
      http.all(`${API}/social/reportes/1/me-gusta`, ({ request }) => {
        pedidos.push(request.method);
        if (responder) return responder();
        dado = request.method === 'POST';
        return HttpResponse.json({ reporteId: 1, cantidadMeGusta: dado ? 3 : 2, yaMeGusta: dado });
      }),
    );
    return pedidos;
  }

  it('el vecino lo da y lo quita, y el botón dice si está dado', async () => {
    ingresarComo('VECINO');
    const pedidos = feedConMeGusta();
    renderRuta('/', <PaginaInicio />);

    const boton = await screen.findByRole('button', { name: 'Me gusta (2 me gusta)' });
    expect(boton).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(boton);

    const dado = await screen.findByRole('button', { name: 'Quitar me gusta (3 me gusta)' });
    expect(dado).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(dado);

    expect(await screen.findByRole('button', { name: 'Me gusta (2 me gusta)' })).toBeInTheDocument();
    expect(pedidos).toEqual(['POST', 'DELETE']);
  });

  it('si el servidor lo rechaza, lo dice y el contador queda como estaba', async () => {
    ingresarComo('VECINO');
    feedConMeGusta(errorDelServidor);
    renderRuta('/', <PaginaInicio />);

    await userEvent.click(await screen.findByRole('button', { name: 'Me gusta (2 me gusta)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
    expect(screen.getByRole('button', { name: 'Me gusta (2 me gusta)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('sin sesión lleva al ingreso', async () => {
    const pedidos = feedConMeGusta();
    renderConSesion('/', { '/': <PaginaInicio />, '/ingreso': <p>Ingreso</p> });

    await userEvent.click(await screen.findByRole('button', { name: 'Me gusta (2 me gusta)' }));

    expect(await screen.findByText('Ingreso')).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it('el operador ve el contador pero no lo puede dar', async () => {
    ingresarComo('OPERADOR');
    feedConMeGusta();
    renderRuta('/', <PaginaInicio />);

    const articulo = await screen.findByRole('article', { name: 'Bache, reporte del Vecino 1' });
    expect(await within(articulo).findByText('2 me gusta')).toBeInTheDocument();
    expect(within(articulo).queryByRole('button', { name: /Me gusta/ })).not.toBeInTheDocument();
  });
});

describe('la publicación: comentarios', () => {
  /** Una publicación con comentarios que cambian según lo que recibe el servidor. */
  function servirPublicacion(iniciales: Comentario[] = [comentario(2)], cantidadVecinos = 1) {
    let comentarios = [...iniciales];
    const recibidos: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
    servidor.use(
      http.get(`${API}/social/reportes/31`, () =>
        HttpResponse.json(reporte({ cantidadComentarios: comentarios.length })),
      ),
      http.get(`${API}/social/reportes/31/comentarios`, () => HttpResponse.json({ comentarios })),
      http.get(`${API}/incidentes/3`, () => HttpResponse.json(fichaDelProblema(cantidadVecinos))),
      http.post(`${API}/social/reportes/31/comentarios`, async ({ request }) => {
        const cuerpo = (await request.json()) as { texto: string };
        recibidos.push({ metodo: 'POST', ruta: 'comentarios', cuerpo });
        const nuevo = comentario(99, { texto: cuerpo.texto, autor: vecino2, esMio: true });
        comentarios = [...comentarios, nuevo];
        return HttpResponse.json(nuevo, { status: 201 });
      }),
      http.patch(`${API}/social/comentarios/:id`, async ({ params, request }) => {
        const cuerpo = (await request.json()) as { texto: string };
        recibidos.push({ metodo: 'PATCH', ruta: String(params.id), cuerpo });
        comentarios = comentarios.map((c) =>
          c.id === Number(params.id)
            ? { ...c, texto: cuerpo.texto, editadoEn: '2026-10-09T15:15:33.494Z' }
            : c,
        );
        return HttpResponse.json(comentarios.find((c) => c.id === Number(params.id)));
      }),
      http.delete(`${API}/social/comentarios/:id`, ({ params }) => {
        recibidos.push({ metodo: 'DELETE', ruta: String(params.id), cuerpo: null });
        comentarios = comentarios.filter((c) => c.id !== Number(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return recibidos;
  }

  const abrir = () => renderConSesion('/reporte/31', { '/reporte/:id': <PaginaReporte /> });

  it('muestra el autor, la foto, la descripción, el problema y los comentarios', async () => {
    servirPublicacion([comentario(2, { editadoEn: '2026-10-08T15:15:33.494Z' })]);
    abrir();

    expect(await screen.findByText('Frente al kiosco')).toBeInTheDocument();
    expect(screen.getByText('Reporte del')).toHaveTextContent('Reporte del Vecino 1');
    // El problema, sin ir a otra página: qué es, en qué está, el mapa y sus datos.
    expect(await screen.findByRole('heading', { name: 'Vereda rota', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Derivado al área de/)).toHaveTextContent('Derivado al área de Veredas');
    expect(screen.getByRole('region', { name: 'Estado del problema' })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Mapa simulado' })).toHaveTextContent('Vereda rota');
    const informacion = screen.getByRole('complementary', { name: 'Información' });
    expect(within(informacion).getByText('Lanín 120, Villa Ceferino')).toBeInTheDocument();
    // Lo reportó solo este vecino: no hay a dónde más ir.
    expect(screen.queryByRole('link', { name: /reportaron este problema/ })).not.toBeInTheDocument();
    expect(await screen.findByText('Confirmo, sigue igual')).toBeInTheDocument();
    expect(screen.getByText(/editado/)).toBeInTheDocument();
    // Sin sesión no hay caja: invita a ingresar.
    expect(screen.getByRole('link', { name: 'Ingresá' })).toHaveAttribute('href', '/ingreso');
    expect(screen.queryByLabelText('Escribí un comentario')).not.toBeInTheDocument();
  });

  it('si lo reportaron otros vecinos, lleva a la ficha que junta todos', async () => {
    servirPublicacion([], 3);
    abrir();

    const enlace = await screen.findByRole('link', { name: /Otros 2 vecinos reportaron este problema/ });
    expect(enlace).toHaveAttribute('href', '/incidente/3');
  });

  it('el comentario de SnapIt se ve con su nombre, su logo y la marca de cuenta oficial', async () => {
    servirPublicacion([
      comentario(3, { texto: '¡Gracias por tu reporte! Ya fue derivado al área de Bacheo.', autor: snapit }),
    ]);
    abrir();

    const fila = (await screen.findByText(/Gracias por tu reporte/)).closest('li')!;
    expect(within(fila).getByText('SnapIt')).toBeInTheDocument();
    expect(within(fila).getByRole('img', { name: 'cuenta oficial' })).toBeInTheDocument();
    expect(fila.querySelector('img')).toBeInTheDocument();
    expect(within(fila).queryByText(/Vecino/)).not.toBeInTheDocument();
  });

  it('el vecino comenta: se envía sin los espacios de los bordes y aparece en la lista', async () => {
    ingresarComo('VECINO');
    const recibidos = servirPublicacion();
    abrir();

    await userEvent.type(await screen.findByLabelText('Escribí un comentario'), '  Sigue ahí  ');
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    expect(await screen.findByText('Sigue ahí')).toBeInTheDocument();
    expect(recibidos).toEqual([{ metodo: 'POST', ruta: 'comentarios', cuerpo: { texto: 'Sigue ahí' } }]);
    expect(screen.getByLabelText('Escribí un comentario')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Comentarios (2)' })).toBeInTheDocument();
  });

  it('un comentario de más de 1000 caracteres no se puede enviar', async () => {
    ingresarComo('VECINO');
    servirPublicacion();
    abrir();
    const caja = await screen.findByLabelText('Escribí un comentario');

    await userEvent.click(caja);
    await userEvent.paste('a'.repeat(1001));

    expect(screen.getByText('1001/1000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comentar' })).toBeDisabled();
  });

  it('edita su comentario y lo elimina con confirmación; los ajenos no se tocan', async () => {
    ingresarComo('VECINO');
    const recibidos = servirPublicacion([
      comentario(2),
      comentario(5, { texto: 'El mío', autor: vecino1, esMio: true }),
    ]);
    abrir();

    const ajeno = (await screen.findByText('Confirmo, sigue igual')).closest('li')!;
    expect(within(ajeno).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(ajeno).queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();

    const mio = screen.getByText('El mío').closest('li')!;
    await userEvent.click(within(mio).getByRole('button', { name: 'Editar' }));
    const campo = within(mio).getByLabelText('Editar el comentario');
    await userEvent.clear(campo);
    await userEvent.paste('El mío, corregido');
    await userEvent.click(within(mio).getByRole('button', { name: 'Guardar' }));
    // Al guardar se vuelve a pedir la lista: se espera a que muestre el texto nuevo y el botón de eliminar.
    const eliminar = await waitFor(() =>
      within(screen.getByText('El mío, corregido').closest('li')!).getByRole('button', { name: 'Eliminar' }),
    );
    await userEvent.click(eliminar);
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, eliminar' }));

    expect(await screen.findByRole('heading', { name: 'Comentarios (1)' })).toBeInTheDocument();
    expect(screen.queryByText('El mío, corregido')).not.toBeInTheDocument();
    expect(recibidos.map(({ metodo, ruta }) => `${metodo} ${ruta}`)).toEqual(['PATCH 5', 'DELETE 5']);
  });

  it('el operador elimina un comentario ajeno, pero no comenta', async () => {
    ingresarComo('OPERADOR');
    const recibidos = servirPublicacion();
    abrir();

    const fila = (await screen.findByText('Confirmo, sigue igual')).closest('li')!;
    expect(screen.queryByLabelText('Escribí un comentario')).not.toBeInTheDocument();
    expect(within(fila).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    await userEvent.click(within(fila).getByRole('button', { name: 'Eliminar' }));
    await userEvent.click(within(fila).getByRole('button', { name: 'Sí, eliminar' }));

    expect(await screen.findByText('Todavía no hay comentarios.')).toBeInTheDocument();
    expect(recibidos.map(({ metodo, ruta }) => `${metodo} ${ruta}`)).toEqual(['DELETE 2']);
  });
});

describe('la ficha del problema (incidente)', () => {
  function servirIncidente(cambios: Record<string, unknown> = {}, reportes = [reporte()]) {
    servidor.use(
      http.get(`${API}/incidentes/3`, () =>
        HttpResponse.json({
          id: 3,
          lat: -38.95,
          lon: -68.06,
          categoria: { id: 2, nombre: 'Vereda rota' },
          estado: 'DERIVADO',
          enRevision: false,
          severidad: 'GRAVE',
          primerReporteEn: '2026-10-06T15:15:33.494Z',
          cantidadReportes: reportes.length,
          cantidadVecinos: reportes.length,
          direccion: 'Lanín 120, Villa Ceferino',
          fotos: [{ id: 31, url: '/api/fotos/31' }],
          fotoCierre: null,
          resueltoEn: null,
          derivadoA: { id: 2, nombre: 'Veredas' },
          ...cambios,
        }),
      ),
      http.get(`${API}/social/incidentes/3/reportes`, () => HttpResponse.json({ incidenteId: 3, reportes })),
    );
  }

  const abrir = () => renderConSesion('/incidente/3', { '/incidente/:id': <PaginaIncidente /> });

  it('muestra los datos, el mapa y en qué paso está su atención, sin comentarios propios', async () => {
    servirIncidente();
    abrir();

    expect(await screen.findByRole('heading', { name: 'Vereda rota', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Grave')).toBeInTheDocument();
    expect(screen.getByText('Lanín 120, Villa Ceferino')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Mapa simulado' })).toHaveTextContent('Vereda rota');

    const recorrido = screen.getByRole('region', { name: 'Estado del problema' });
    const pasos = within(recorrido).getAllByRole('listitem');
    expect(pasos.map((paso) => paso.textContent)).toEqual([
      expect.stringContaining('En revisión (cumplido)'),
      expect.stringContaining('Verificado (cumplido)'),
      expect.stringContaining('Derivado al área (cumplido)'),
      expect.stringContaining('En ejecución (pendiente)'),
      expect.stringContaining('Resuelto (pendiente)'),
    ]);
    expect(pasos[2]).toHaveAttribute('aria-current', 'step');

    // Un solo vecino: no hay lista de reportes. Y lo social está en la publicación, no acá.
    expect(screen.queryByRole('region', { name: 'Reportes de este problema' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Fotos de los vecinos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comentarios/)).not.toBeInTheDocument();
  });

  it('si lo reportaron varios vecinos, lista sus reportes y cada uno lleva a su publicación', async () => {
    servirIncidente({}, [
      reporte(),
      reporte({ id: 32, autor: vecino2, cantidadMeGusta: 1, cantidadComentarios: 0 }),
    ]);
    abrir();

    const lista = await screen.findByRole('region', { name: 'Reportes de este problema' });
    expect(await within(lista).findByRole('heading', { name: 'Reportes (2)' })).toBeInTheDocument();
    const enlaces = within(lista).getAllByRole('link');
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual(['/reporte/31', '/reporte/32']);
    expect(enlaces[1]).toHaveTextContent('Vecino 2');
  });

  it('un problema resuelto muestra el antes y el después, y el paso final con su fecha', async () => {
    servirIncidente({
      estado: 'RESUELTO',
      fotoCierre: { id: 90, url: '/api/fotos/90' },
      resueltoEn: '2026-11-05T15:00:00.000Z',
    });
    abrir();

    const comparacion = await screen.findByRole('region', { name: 'Antes y después' });
    expect(within(comparacion).getByText(/Después · resuelto el/)).toBeInTheDocument();
    expect(
      within(comparacion).getByAltText('Vereda rota, después: cómo quedó al resolverse'),
    ).toHaveAttribute('src', expect.stringContaining('/fotos/90'));
    const recorrido = screen.getByRole('region', { name: 'Estado del problema' });
    const final = within(recorrido).getAllByRole('listitem')[4]!;
    expect(final).toHaveAttribute('aria-current', 'step');
    expect(final).toHaveTextContent('Resuelto (cumplido)');
  });
});

describe('haceCuanto', () => {
  const ahora = new Date('2026-11-04T15:00:00Z');
  const hace = (ms: number) => haceCuanto(new Date(ahora.getTime() - ms), ahora);

  it('dice minutos, horas y días como una red social, y pasada una semana la fecha', () => {
    expect(hace(30_000)).toBe('hace un momento');
    expect(hace(5 * 60_000)).toBe('hace 5 min');
    expect(hace(3_600_000)).toBe('hace 1 hora');
    expect(hace(30 * 3_600_000)).toBe('ayer');
    expect(hace(6 * 86_400_000)).toBe('hace 6 días');
    expect(hace(8 * 86_400_000)).toBe('27 de octubre de 2026');
  });
});
