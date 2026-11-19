import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VistaPreviaFoto } from '../src/compartido/componentes/VistaPreviaFoto.js';

describe('vista previa de la foto', () => {
  it('si el navegador no la puede mostrar (una HEIC), avisa que se manda igual', () => {
    const { rerender } = render(<VistaPreviaFoto src="blob:una" alt="Vista previa" className="" />);

    fireEvent.error(screen.getByAltText('Vista previa'));
    expect(screen.getByText(/se envía igual/)).toBeInTheDocument();

    // Con otra foto vuelve a intentar mostrarla.
    rerender(<VistaPreviaFoto src="blob:otra" alt="Vista previa" className="" />);
    expect(screen.getByAltText('Vista previa')).toBeInTheDocument();
  });
});
