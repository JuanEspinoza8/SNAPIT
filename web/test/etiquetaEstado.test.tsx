import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ESTADOS, ORDEN_ESTADOS } from '../src/funcionalidades/mapa/estados.js';
import { EtiquetaEstado } from '../src/funcionalidades/mapa/EtiquetaEstado.js';

describe('etiqueta del estado', () => {
  it.each(ORDEN_ESTADOS)('%s se lee por el texto y por el ícono, no solo por el color', (estado) => {
    render(<EtiquetaEstado estado={estado} />);

    const etiqueta = screen.getByText(ESTADOS[estado].etiqueta);
    expect(etiqueta).toHaveClass(ESTADOS[estado].clase, 'text-sobre-estado');
    // El ícono es un extra para la vista: el lector de pantalla lee el texto.
    expect(etiqueta.querySelector(`svg[data-icono="${estado}"]`)).toHaveAttribute('aria-hidden', 'true');
  });
});
