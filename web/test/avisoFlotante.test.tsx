import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvisoFlotante, conAviso } from '../src/compartido/componentes/AvisoFlotante.js';

/** El estado de la navegación tal como quedó: es lo que el navegador conserva al recargar. */
function EstadoGuardado() {
  return <span data-testid="estado">{JSON.stringify(useLocation().state)}</span>;
}
const estadoGuardado = () => JSON.parse(screen.getByTestId('estado').textContent!) as unknown;

function renderConEstado(estado: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: estado }]}>
      <AvisoFlotante />
      <EstadoGuardado />
    </MemoryRouter>,
  );
}

const enviado = conAviso({ titulo: 'Reporte enviado', texto: 'Queda pendiente de aprobación.' });

afterEach(() => {
  vi.useRealTimers();
});

describe('aviso flotante', () => {
  it('muestra el aviso que llegó con la navegación y se va solo a los 5 segundos', () => {
    vi.useFakeTimers();
    renderConEstado(enviado);

    expect(screen.getByRole('status')).toHaveTextContent('Reporte enviado');
    expect(screen.getByText('Queda pendiente de aprobación.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4900));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('se cierra con «Cerrar»', async () => {
    renderConEstado(enviado);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('al recargar la página no vuelve a salir (#187)', () => {
    const { unmount } = renderConEstado(enviado);
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Apenas se muestra, ya no está en el estado de la navegación.
    const guardado = estadoGuardado();
    expect(guardado).toBeNull();

    // Recargar: la página arranca de nuevo con el estado que quedó guardado.
    unmount();
    renderConEstado(guardado);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sin aviso, o con otro estado de navegación, no muestra nada', () => {
    renderConEstado({ foco: { lat: -38.95, lon: -68.06 } });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
