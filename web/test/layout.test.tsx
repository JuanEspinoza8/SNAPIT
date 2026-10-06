import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '../src/compartido/componentes/Layout.js';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';

function montar(ruta: string) {
  return render(
    <ProveedorCliente>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<p>Contenido del inicio</p>} />
            <Route path="/salud" element={<p>Contenido de salud</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ProveedorCliente>,
  );
}

describe('layout base', () => {
  it('muestra el encabezado, el pie y el contenido de la ruta', () => {
    montar('/');

    expect(screen.getByRole('link', { name: 'SNAPit' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Estado del servidor' })).toHaveAttribute('href', '/salud');
    expect(screen.getByText('Contenido del inicio')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('SNAPit');
  });

  it('navega al contenido de la otra ruta', () => {
    montar('/salud');

    expect(screen.getByText('Contenido de salud')).toBeInTheDocument();
  });
});
