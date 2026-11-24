import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { SeccionAdministracion } from '../src/funcionalidades/administracion/SeccionAdministracion.js';
import { renderRuta } from './apoyo.js';

describe('pestañas de la administración', () => {
  it('muestra solo usuarios, organismos y categorías: los ajustes técnicos no van en el menú', () => {
    renderRuta('/administracion', <SeccionAdministracion />);

    const menu = screen.getByRole('navigation', { name: 'Administración' });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((enlace) => enlace.textContent),
    ).toEqual(['Usuarios', 'Organismos y áreas', 'Categorías']);
    expect(within(menu).getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page');
  });
});
