import { describe, expect, it } from 'vitest';
import {
  validarClaveIngresada,
  validarClaveNueva,
  validarCorreo,
  validarNombre,
} from '../src/funcionalidades/cuenta/validaciones.js';

describe('correo', () => {
  it('es obligatorio, también si solo tiene espacios', () => {
    expect(validarCorreo('')).toBe('Es obligatorio');
    expect(validarCorreo('   ')).toBe('Es obligatorio');
  });

  it('tiene que tener formato de correo', () => {
    expect(validarCorreo('ana')).toBe('No es un correo válido');
    expect(validarCorreo('ana@ejemplo')).toBe('No es un correo válido');
    expect(validarCorreo('ana @ejemplo.com')).toBe('No es un correo válido');
    expect(validarCorreo('  ana@ejemplo.com  ')).toBeNull();
  });

  it('hasta 150 caracteres', () => {
    const local = 'a'.repeat(150 - '@ejemplo.com'.length);
    expect(validarCorreo(`${local}@ejemplo.com`)).toBeNull();
    expect(validarCorreo(`a${local}@ejemplo.com`)).toBe('Tiene que tener hasta 150 caracteres');
  });
});

describe('nombre', () => {
  it('es obligatorio, también si solo tiene espacios', () => {
    expect(validarNombre('')).toBe('Es obligatorio');
    expect(validarNombre('  ')).toBe('Es obligatorio');
  });

  it('hasta 120 caracteres sin contar los espacios de los bordes', () => {
    expect(validarNombre(` ${'a'.repeat(120)} `)).toBeNull();
    expect(validarNombre('a'.repeat(121))).toBe('Tiene que tener hasta 120 caracteres');
  });
});

describe('clave nueva', () => {
  it('al menos 8 caracteres', () => {
    expect(validarClaveNueva('')).toBe('Es obligatoria');
    expect(validarClaveNueva('a'.repeat(7))).toBe('Tiene que tener al menos 8 caracteres');
    expect(validarClaveNueva('a'.repeat(8))).toBeNull();
  });

  it('hasta 72 bytes', () => {
    const error = 'Tiene que tener hasta 72 caracteres (menos si usa tildes o ñ)';
    expect(validarClaveNueva('a'.repeat(72))).toBeNull();
    expect(validarClaveNueva('a'.repeat(73))).toBe(error);
    // Cada ñ ocupa dos bytes: 36 entran justo, 37 no.
    expect(validarClaveNueva('ñ'.repeat(36))).toBeNull();
    expect(validarClaveNueva('ñ'.repeat(37))).toBe(error);
  });
});

describe('en el ingreso la clave solo es obligatoria', () => {
  it('acepta cualquier clave no vacía', () => {
    expect(validarClaveIngresada('')).toBe('Es obligatoria');
    expect(validarClaveIngresada('corta')).toBeNull();
  });
});
