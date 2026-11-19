import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvisoFlotante, conAviso } from '../src/compartido/componentes/AvisoFlotante.js';

function renderConEstado(estado: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: estado }]}>
      <AvisoFlotante />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('aviso flotante', () => {
  it('muestra el aviso que llegó con la navegación y se va solo a los 5 segundos', () => {
    vi.useFakeTimers();
    renderConEstado(conAviso({ titulo: 'Reporte enviado', texto: 'Queda pendiente de aprobación.' }));

    expect(screen.getByRole('status')).toHaveTextContent('Reporte enviado');
    expect(screen.getByText('Queda pendiente de aprobación.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4900));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sin aviso, o con otro estado de navegación, no muestra nada', () => {
    renderConEstado({ foco: { lat: -38.95, lon: -68.06 } });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
