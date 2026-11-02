import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginaBandeja } from '../src/funcionalidades/bandeja/paginaBandeja.js';
import { PaginaFicha } from '../src/funcionalidades/bandeja/paginaFicha.js';
import type { IncidenteBandeja } from '../src/funcionalidades/bandeja/tipos.js';
import { renderConSesion } from './apoyo.js';

const categorias = [
  { id: 3, nombre: 'Cordón sin rampa', area: { id: 2, nombre: 'Veredas' } },
  { id: 1, nombre: 'Pozo en la calzada', area: { id: 1, nombre: 'Bacheo' } },
  { id: 2, nombre: 'Vereda rota', area: { id: 2, nombre: 'Veredas' } },
];

const conAjuste: IncidenteBandeja = {
  id: 7,
  estado: 'DERIVADO',
  categoria: { id: 1, nombre: 'Pozo en la calzada' },
  area: { id: 1, nombre: 'Bacheo' },
  direccion: 'Lanín 120, Villa Ceferino',
  cantidadReportes: 3,
  primerReporteEn: '2026-10-12T14:20:00.000Z',
  puntajePrioridad: 46.25,
  prioridadManual: 80,
  motivos: [
    { factor: 'SEVERIDAD', valor: 40, detalle: 'Gravedad moderada en Pozo en la calzada: +40' },
    { factor: 'ANTIGUEDAD', valor: 0, detalle: 'Lleva menos de un día sin resolverse: +0' },
    {
      factor: 'AJUSTE_MANUAL',
      valor: 33.75,
      detalle: 'Ajuste manual de Juan Pérez (Obra programada): +33,8',
    },
  ],
};
const calculado: IncidenteBandeja = {
  ...conAjuste,
  id: 9,
  estado: 'VERIFICADO',
  categoria: { id: 3, nombre: 'Cordón sin rampa' },
  direccion: null,
  cantidadReportes: 1,
  puntajePrioridad: 52.5,
  prioridadManual: null,
  motivos: [{ factor: 'CONTEXTO_URBANO', valor: 15, detalle: 'A 80 m de Escuela N° 123 (escuela): +15' }],
};

// Lo que pidió la pantalla a GET /api/bandeja, como texto de la consulta.
let consultas: string[] = [];
let respuesta: IncidenteBandeja[] = [];

const servidor = setupServer(
  http.get('*/api/auth/yo', () =>
    HttpResponse.json({
      usuario: {
        id: 3,
        email: 'bacheo@ejemplo.com',
        nombre: 'Operador de Bacheo',
        rol: 'OPERADOR',
        organismoId: 1,
        areaId: 1,
      },
    }),
  ),
  http.get('*/api/categorias', () => HttpResponse.json({ categorias })),
  http.get('*/api/bandeja', ({ request }) => {
    consultas.push(new URL(request.url).search);
    return HttpResponse.json({ incidentes: respuesta });
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
beforeEach(() => {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  consultas = [];
  respuesta = [conAjuste, calculado];
});
afterEach(() => servidor.resetHandlers());

const montar = (entrada = '/bandeja') =>
  renderConSesion(entrada, { '/bandeja': <PaginaBandeja />, '/bandeja/:id': <PaginaFicha /> });
const ubicacion = () => screen.getByTestId('ubicacion').textContent;
const filas = async () => (await screen.findAllByRole('row')).slice(1);

describe('bandeja del operador', () => {
  it('lista los incidentes en el orden del servidor, con los motivos en texto', async () => {
    montar();
    const [primera, segunda] = await filas();

    expect(within(primera!).getByRole('link', { name: '#7 · Pozo en la calzada' })).toBeInTheDocument();
    expect(within(primera!).getByText('Lanín 120, Villa Ceferino')).toBeInTheDocument();
    expect(within(primera!).getByText('Derivado al área')).toBeInTheDocument();
    expect(within(primera!).getByText('Gravedad moderada en Pozo en la calzada: +40')).toBeInTheDocument();
    // Lo que suma cero no se repite en la bandeja.
    expect(within(primera!).queryByText(/Lleva menos de un día/)).not.toBeInTheDocument();

    expect(within(segunda!).getByText('A 80 m de Escuela N° 123 (escuela): +15')).toBeInTheDocument();
    expect(within(segunda!).getByText('Dirección pendiente')).toBeInTheDocument();
    expect(within(segunda!).getByText('Verificado')).toBeInTheDocument();
  });

  it('marca la prioridad fijada a mano y muestra también la calculada', async () => {
    montar();
    const [primera, segunda] = await filas();

    expect(within(primera!).getByText('80')).toBeInTheDocument();
    expect(within(primera!).getByText('Manual')).toBeInTheDocument();
    expect(within(primera!).getByText(/calculada 46,25/)).toBeInTheDocument();

    expect(within(segunda!).getByText('52,5')).toBeInTheDocument();
    expect(within(segunda!).queryByText('Manual')).not.toBeInTheDocument();
  });

  it('sin filtros pide la bandeja del área del operador', async () => {
    montar();
    await filas();

    expect(consultas).toEqual(['']);
    const area = screen.getByLabelText('Área');
    await waitFor(() =>
      expect(within(area).getByRole('option', { selected: true })).toHaveTextContent('Mi área (Bacheo)'),
    );
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('cada filtro queda en la URL y se manda al servidor', async () => {
    const usuario = userEvent.setup();
    montar();
    await filas();

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'DERIVADO');
    await usuario.selectOptions(screen.getByLabelText('Área'), 'todas');
    await usuario.selectOptions(screen.getByLabelText('Categoría'), 'Vereda rota');

    expect(ubicacion()).toBe('/bandeja?areaId=todas&estado=DERIVADO&categoriaId=2');
    await waitFor(() => expect(consultas.at(-1)).toBe('?areaId=todas&estado=DERIVADO&categoriaId=2'));

    await usuario.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(ubicacion()).toBe('/bandeja');
  });

  it('un link compartido abre la bandeja con sus filtros y descarta los inválidos', async () => {
    montar('/bandeja?areaId=2&estado=CUALQUIERA&categoriaId=3');
    await filas();

    expect(consultas).toEqual(['?areaId=2&categoriaId=3']);
    await waitFor(() => expect(screen.getByLabelText('Área')).toHaveValue('2'));
    expect(screen.getByLabelText('Categoría')).toHaveValue('3');
    expect(screen.getByLabelText('Estado')).toHaveValue('');
  });

  it('las áreas del filtro salen de las categorías, sin repetir', async () => {
    montar();
    await filas();

    const area = screen.getByLabelText('Área');
    await waitFor(() =>
      expect(
        within(area)
          .getAllByRole('option')
          .map((opcion) => opcion.textContent),
      ).toEqual(['Mi área (Bacheo)', 'Todas las áreas', 'Bacheo', 'Veredas']),
    );
  });

  it('vacía: lo dice y ofrece ver todas las áreas', async () => {
    respuesta = [];
    const usuario = userEvent.setup();
    montar();

    expect(await screen.findByText('No hay incidentes para atender con estos filtros.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Ver todas las áreas' }));
    expect(ubicacion()).toBe('/bandeja?areaId=todas');
  });

  it('si el servidor falla, lo explica y deja reintentar', async () => {
    servidor.use(
      http.get('*/api/bandeja', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'DATOS_INVALIDOS',
              mensaje: 'Hay datos inválidos',
              detalles: [{ campo: 'areaId', mensaje: 'No es un área de tu organismo' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    montar('/bandeja?areaId=99');

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('No es un área de tu organismo');
    expect(within(aviso).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('abre la ficha de un incidente y vuelve a la bandeja con los mismos filtros', async () => {
    servidor.use(http.get('*/api/incidentes/7/gestion', () => new HttpResponse(null, { status: 500 })));
    const usuario = userEvent.setup();
    montar('/bandeja?estado=DERIVADO');

    await usuario.click(await screen.findByRole('link', { name: '#7 · Pozo en la calzada' }));
    expect(ubicacion()).toBe('/bandeja/7');

    await usuario.click(screen.getByRole('link', { name: 'Volver a la bandeja' }));
    expect(ubicacion()).toBe('/bandeja?estado=DERIVADO');
  });
});
