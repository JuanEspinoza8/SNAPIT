import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { iniciales } from '../src/compartido/componentes/AvatarIniciales.js';
import { BotonReportar } from '../src/compartido/componentes/BotonReportar.js';
import { useSesion } from '../src/compartido/sesion/sesionContexto.js';
import type { Rol } from '../src/compartido/sesion/usuario.js';
import type { ReporteMio } from '../src/funcionalidades/misReportes/tipos.js';
import { PaginaPerfil } from '../src/funcionalidades/perfil/PaginaPerfil.js';
import { renderConSesion } from './apoyo.js';

const reporte: ReporteMio = {
  id: 1,
  registradoEn: '2026-10-01T12:00:00.000Z',
  categoria: { id: 3, nombre: 'Cordón sin rampa' },
  severidadDeclarada: 'GRAVE',
  descripcion: 'Frente a la escuela',
  fotos: [],
  estadoVerificacion: 'VERIFICADO',
  incidente: null,
};

let pedidosMisReportes = 0;
const servidor = setupServer(
  http.get('*/api/reportes/mios', () => {
    pedidosMisReportes++;
    return HttpResponse.json({ reportes: [reporte] });
  }),
);

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => {
  servidor.resetHandlers();
  pedidosMisReportes = 0;
});

/** Con sesión de `rol`; sin rol, sin sesión. */
function sesionDe(rol?: Rol) {
  if (!rol) return;
  localStorage.setItem('snapit:tokenAcceso', 'acceso');
  localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
  servidor.use(
    http.get('*/api/auth/yo', () =>
      HttpResponse.json({
        usuario: {
          id: 5,
          email: 'ana@ejemplo.com',
          nombre: 'Ana María Vecina',
          rol,
          organismoId: rol === 'VECINO' ? null : 1,
          areaId: rol === 'OPERADOR' ? 1 : null,
        },
      }),
    ),
  );
}

describe('perfil', () => {
  it('el vecino ve sus datos y abajo sus reportes', async () => {
    sesionDe('VECINO');
    renderConSesion('/perfil', { '/perfil': <PaginaPerfil /> });

    expect(await screen.findByRole('heading', { name: 'Ana María Vecina', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('ana@ejemplo.com')).toBeInTheDocument();
    expect(screen.getByText('Vecino')).toBeInTheDocument();

    const reportes = screen.getByRole('region', { name: 'Mis reportes' });
    expect(await within(reportes).findByText('Cordón sin rampa')).toBeInTheDocument();
    expect(within(reportes).getByRole('link', { name: /Reportar/ })).toHaveAttribute('href', '/reportar');
    expect(pedidosMisReportes).toBe(1);
  });

  it('sin reportes, el vecino ve una sola invitación a reportar: la de la lista', async () => {
    sesionDe('VECINO');
    servidor.use(http.get('*/api/reportes/mios', () => HttpResponse.json({ reportes: [] })));
    renderConSesion('/perfil', { '/perfil': <PaginaPerfil /> });

    const reportes = await screen.findByRole('region', { name: 'Mis reportes' });
    expect(await within(reportes).findByText('Todavía no hiciste reportes')).toBeInTheDocument();
    expect(within(reportes).getAllByRole('link', { name: /Reportar/ })).toHaveLength(1);
    expect(within(reportes).getByRole('link', { name: 'Reportar un problema' })).toHaveAttribute(
      'href',
      '/reportar',
    );
  });

  it('un operador ve sus datos, sin reportes: no los pide', async () => {
    sesionDe('OPERADOR');
    renderConSesion('/perfil', { '/perfil': <PaginaPerfil /> });

    expect(await screen.findByText('Operador')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Mis reportes' })).not.toBeInTheDocument();
    expect(screen.getByText(/Los reportes los hacen los vecinos/)).toBeInTheDocument();
    expect(pedidosMisReportes).toBe(0);
  });
});

describe('iniciales del avatar', () => {
  it.each([
    ['Ana María Vecina', 'AV'],
    ['Bruno', 'B'],
    ['  carla   gómez ', 'CG'],
    ['', '?'],
  ])('«%s» → «%s»', (nombre, esperado) => {
    expect(iniciales(nombre)).toBe(esperado);
  });
});

describe('botón Reportar', () => {
  /** Dice cuándo terminó de cargar la sesión, para mirar el botón recién ahí. */
  function EstadoSesion() {
    return <p>Sesión: {useSesion().estado}</p>;
  }
  const montar = () =>
    renderConSesion('/', {
      '/': (
        <>
          <BotonReportar />
          <EstadoSesion />
        </>
      ),
    });

  it('al vecino lo lleva al formulario', async () => {
    sesionDe('VECINO');
    montar();
    expect(await screen.findByRole('link', { name: /Reportar/ })).toHaveAttribute('href', '/reportar');
  });

  it('sin sesión también va al formulario, que pide ingresar (rutasApp.test)', async () => {
    sesionDe();
    montar();
    const boton = await screen.findByRole('link', { name: /Reportar/ });
    expect(boton).toHaveAttribute('href', '/reportar');
    expect(boton).toHaveAttribute('title', 'Ingresá para reportar un problema');
  });

  it('un operador no lo ve: no reporta', async () => {
    sesionDe('OPERADOR');
    montar();
    await screen.findByText('Sesión: conSesion');
    expect(screen.queryByRole('link', { name: /Reportar/ })).not.toBeInTheDocument();
  });
});
