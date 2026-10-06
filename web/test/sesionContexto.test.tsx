import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion, useSesion } from '../src/compartido/sesion/sesionContexto.js';
import type { Usuario } from '../src/compartido/sesion/usuario.js';

const servidor = setupServer();

beforeAll(() => servidor.listen());
afterAll(() => servidor.close());
afterEach(() => servidor.resetHandlers());

const usuarioVecino: Usuario = {
  id: 2,
  email: 'vecino@ejemplo.com',
  nombre: 'Vecino',
  rol: 'VECINO',
  organismoId: null,
  areaId: null,
};

function MostradorDeSesion() {
  const sesion = useSesion();
  return <p>{`estado=${sesion.estado} usuario=${sesion.usuario?.email ?? 'ninguno'}`}</p>;
}

function montar() {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <ProveedorSesion>
          <MostradorDeSesion />
        </ProveedorSesion>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

describe('proveedor de sesión', () => {
  it('sin tokens guardados queda sin sesión y no consulta /auth/yo', async () => {
    let llamadasYo = 0;
    servidor.use(
      http.get('*/api/auth/yo', () => {
        llamadasYo += 1;
        return HttpResponse.json({ usuario: usuarioVecino });
      }),
    );

    montar();

    expect(await screen.findByText('estado=sinSesion usuario=ninguno')).toBeInTheDocument();
    expect(llamadasYo).toBe(0);
  });

  it('con tokens guardados carga el usuario al arrancar', async () => {
    localStorage.setItem('snapit:tokenAcceso', 'acceso');
    localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
    servidor.use(http.get('*/api/auth/yo', () => HttpResponse.json({ usuario: usuarioVecino })));

    montar();

    expect(await screen.findByText('estado=conSesion usuario=vecino@ejemplo.com')).toBeInTheDocument();
  });

  it('si el servidor descarta la sesión, se borran los tokens', async () => {
    localStorage.setItem('snapit:tokenAcceso', 'acceso');
    localStorage.setItem('snapit:tokenRenovacion', 'renovacion');
    servidor.use(
      http.get('*/api/auth/yo', () =>
        HttpResponse.json({ error: { codigo: 'SIN_SESION', mensaje: 'Volvé a ingresar.' } }, { status: 401 }),
      ),
      http.post('*/api/auth/renovar', () =>
        HttpResponse.json(
          { error: { codigo: 'TOKEN_RENOVACION_INVALIDO', mensaje: 'La sesión no sirve.' } },
          { status: 401 },
        ),
      ),
    );

    montar();

    expect(await screen.findByText('estado=sinSesion usuario=ninguno')).toBeInTheDocument();
    expect(localStorage.getItem('snapit:tokenAcceso')).toBeNull();
    expect(localStorage.getItem('snapit:tokenRenovacion')).toBeNull();
  });
});
