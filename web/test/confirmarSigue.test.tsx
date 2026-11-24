import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Rol } from '../src/compartido/sesion/usuario.js';
import { PaginaIngreso } from '../src/funcionalidades/cuenta/paginaIngreso.js';
import { PaginaIncidente } from '../src/funcionalidades/feed/PaginaIncidente.js';
import { renderConSesion } from './apoyo.js';

// Leaflet necesita medir la pantalla y jsdom no la dibuja: el mapa chico se reemplaza por una lista.
vi.mock('../src/funcionalidades/feed/MapaPuntos.js', () => ({
  MapaPuntos: () => <ul aria-label="Mapa simulado" />,
}));

const API = 'http://localhost:3000/api';

const usuario = (rol: Rol) => ({
  id: 7,
  email: 'x@ejemplo.com',
  nombre: 'Nombre',
  rol,
  organismoId: null,
  areaId: null,
});

const servidor = setupServer();
beforeAll(() => servidor.listen());
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

/** Deja una sesión de ese rol: los tokens en localStorage y `/auth/yo` simulado. */
function ingresarComo(rol: Rol) {
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  servidor.use(http.get('*/api/auth/yo', () => HttpResponse.json({ usuario: usuario(rol) })));
}

/**
 * La ficha del incidente 3 y sus confirmaciones, que cambian con lo que recibe el servidor. `alConfirmar` dice qué
 * contesta el POST; por defecto la guarda y devuelve el contador nuevo. Sin `vigencia` es permanente; con ella,
 * temporal: vence en `hasta` y, al confirmar, pasa a `renovada`.
 */
function servirIncidente({
  estado = 'DERIVADO',
  confirmaciones = 0,
  yaConfirmo = false,
  alConfirmar,
  vigencia,
}: {
  estado?: string;
  confirmaciones?: number;
  yaConfirmo?: boolean;
  alConfirmar?: () => Response;
  vigencia?: { hasta: string; renovada: string };
} = {}) {
  let cantidad = confirmaciones;
  let vigenteHasta = vigencia?.hasta ?? null;
  const pedidos: string[] = [];
  servidor.use(
    http.get(`${API}/incidentes/3`, () =>
      HttpResponse.json({
        id: 3,
        lat: -38.95,
        lon: -68.06,
        categoria: { id: 2, nombre: 'Vereda rota' },
        estado,
        enRevision: false,
        severidad: 'GRAVE',
        primerReporteEn: '2026-10-06T15:15:33.494Z',
        cantidadReportes: 1,
        cantidadVecinos: 1,
        cantidadConfirmaciones: cantidad,
        direccion: 'Lanín 120, Villa Ceferino',
        fotos: [{ id: 31, url: '/api/fotos/31' }],
        fotoCierre: null,
        resueltoEn: null,
        derivadoA: { id: 2, nombre: 'Veredas' },
        tipoVigencia: vigencia ? 'TEMPORAL' : 'PERMANENTE',
        vigenteHasta,
      }),
    ),
    http.get(`${API}/social/incidentes/3/comentarios`, () =>
      HttpResponse.json({ incidenteId: 3, comentarios: [] }),
    ),
    http.get(`${API}/incidentes/3/confirmacion`, () => {
      pedidos.push('GET confirmacion');
      return HttpResponse.json({ confirmado: yaConfirmo });
    }),
    http.post(`${API}/incidentes/3/confirmaciones`, () => {
      pedidos.push('POST confirmaciones');
      if (alConfirmar) return alConfirmar();
      cantidad += 1;
      yaConfirmo = true;
      vigenteHasta = vigencia?.renovada ?? null;
      return HttpResponse.json(
        { incidenteId: 3, cantidadConfirmaciones: cantidad, vigenteHasta },
        { status: 201 },
      );
    }),
  );
  return {
    pedidos,
    /** Otra confirmación del mismo vecino, por ejemplo desde la app, que la web todavía no vio. */
    confirmarPorFuera: () => {
      cantidad += 1;
    },
  };
}

const abrir = () =>
  renderConSesion('/incidente/3', { '/incidente/:id': <PaginaIncidente />, '/ingreso': <PaginaIngreso /> });

/** El botón, ya habilitado: mientras se pregunta si el vecino ya confirmó, no deja confirmar. */
async function boton(nombre: string) {
  const encontrado = await screen.findByRole('button', { name: nombre });
  await waitFor(() => expect(encontrado).toBeEnabled());
  return encontrado;
}

const conflicto = (codigo: string, mensaje: string) =>
  HttpResponse.json({ error: { codigo, mensaje } }, { status: 409 });

describe('confirmar que el problema sigue (F12)', () => {
  it('el vecino confirma: sube el contador y el botón queda deshabilitado diciéndolo', async () => {
    ingresarComo('VECINO');
    const { pedidos } = servirIncidente({ confirmaciones: 2 });
    const usuarioEvento = userEvent.setup();
    abrir();

    expect(await screen.findByText('2 vecinos confirmaron que sigue')).toBeInTheDocument();
    await usuarioEvento.click(await boton('Sigue estando'));

    expect(await screen.findByText('3 vecinos confirmaron que sigue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ya confirmaste que sigue' })).toBeDisabled();
    expect(pedidos).toEqual(['GET confirmacion', 'POST confirmaciones']);
  });

  it('en un temporal muestra hasta cuándo está vigente, y al confirmar la fecha renovada', async () => {
    ingresarComo('VECINO');
    servirIncidente({
      vigencia: { hasta: '2026-11-26T15:00:00.000Z', renovada: '2026-12-01T15:00:00.000Z' },
    });
    const usuarioEvento = userEvent.setup();
    abrir();

    expect(await screen.findByText('Vigente hasta el 26 de noviembre de 2026')).toBeInTheDocument();
    await usuarioEvento.click(await boton('Sigue estando'));

    // La fecha nueva sale de la respuesta del POST: la ficha no se vuelve a pedir.
    expect(await screen.findByText('Vigente hasta el 1 de diciembre de 2026')).toBeInTheDocument();
  });

  it('en un permanente dice que no vence', async () => {
    ingresarComo('VECINO');
    servirIncidente();
    abrir();

    expect(await screen.findByText('Permanente: no vence')).toBeInTheDocument();
  });

  it('si ya confirmó, el botón aparece deshabilitado y lo dice', async () => {
    ingresarComo('VECINO');
    const { pedidos } = servirIncidente({ confirmaciones: 1, yaConfirmo: true });
    abrir();

    expect(await screen.findByRole('button', { name: 'Ya confirmaste que sigue' })).toBeDisabled();
    expect(screen.getByText('1 vecino confirmó que sigue')).toBeInTheDocument();
    expect(pedidos).toEqual(['GET confirmacion']);
  });

  it('si el servidor dice que ya había confirmado, queda como confirmado y el contador la cuenta', async () => {
    ingresarComo('VECINO');
    const incidente = servirIncidente({
      alConfirmar: () => {
        incidente.confirmarPorFuera();
        return conflicto('YA_CONFIRMADO', 'Ya confirmaste que este problema sigue');
      },
    });
    const usuarioEvento = userEvent.setup();
    abrir();

    await usuarioEvento.click(await boton('Sigue estando'));

    expect(await screen.findByRole('button', { name: 'Ya confirmaste que sigue' })).toBeDisabled();
    expect(await screen.findByText('1 vecino confirmó que sigue')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si no se puede confirmar, dice por qué y el contador queda igual', async () => {
    ingresarComo('VECINO');
    servirIncidente({
      alConfirmar: () => conflicto('INCIDENTE_CADUCADO', 'El incidente caducó: ya no está vigente'),
    });
    const usuarioEvento = userEvent.setup();
    abrir();

    await usuarioEvento.click(await boton('Sigue estando'));

    expect(await screen.findByRole('alert')).toHaveTextContent('El incidente caducó: ya no está vigente');
    expect(screen.getByText('Nadie confirmó todavía que sigue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sigue estando' })).toBeEnabled();
  });

  it('sin sesión invita a ingresar y, al ingresar, vuelve a la ficha sin confirmar solo', async () => {
    const { pedidos } = servirIncidente();
    servidor.use(
      http.post('*/api/auth/ingreso', () =>
        HttpResponse.json({
          tokenAcceso: 'acceso',
          tokenRenovacion: 'renovacion',
          usuario: usuario('VECINO'),
        }),
      ),
      http.get('*/api/auth/yo', () => HttpResponse.json({ usuario: usuario('VECINO') })),
    );
    const usuarioEvento = userEvent.setup();
    abrir();

    await usuarioEvento.click(await boton('Ingresá para confirmar que sigue'));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/ingreso');

    await usuarioEvento.type(screen.getByLabelText('Correo'), 'x@ejemplo.com');
    await usuarioEvento.type(screen.getByLabelText('Clave'), 'una-clave');
    await usuarioEvento.click(screen.getByRole('button', { name: 'Ingresar' }));

    await boton('Sigue estando');
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/incidente/3');
    expect(pedidos).toEqual(['GET confirmacion']);
  });

  it.each<Rol>(['OPERADOR', 'ADMINISTRADOR'])('el %s ve solo el contador', async (rol) => {
    ingresarComo(rol);
    const { pedidos } = servirIncidente({ confirmaciones: 4 });
    abrir();

    expect(await screen.findByText('4 vecinos confirmaron que sigue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sigue/ })).not.toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it.each<Rol | null>(['VECINO', 'OPERADOR', null])(
    'en un problema resuelto no hay nada que confirmar: ni botón ni contador (%s)',
    async (rol) => {
      if (rol) ingresarComo(rol);
      const { pedidos } = servirIncidente({ estado: 'RESUELTO', confirmaciones: 1 });
      abrir();

      expect(await screen.findByRole('heading', { name: 'Vereda rota' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /sigue/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/confirm/)).not.toBeInTheDocument();
      expect(pedidos).toEqual([]);
    },
  );
});
