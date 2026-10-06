import { describe, expect, it, vi } from 'vitest';
import { ErrorApi, aErrorApi, leerError } from '../src/compartido/red/error.js';

describe('errores de la API', () => {
  it('lee el mensaje del cuerpo de error', () => {
    const error = leerError(409, { error: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya hay una cuenta' } });

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error.mensaje).toBe('Ya hay una cuenta');
    expect(error.codigo).toBe('EMAIL_EN_USO');
    expect(error.status).toBe(409);
    expect(error.detalles).toEqual([]);
  });

  it('lee los detalles campo por campo', () => {
    const error = leerError(400, {
      error: {
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Hay datos inválidos',
        detalles: [{ campo: 'clave', mensaje: 'Falta la clave' }, { algo: 'se ignora' }],
      },
    });

    expect(error.detalles).toEqual([{ campo: 'clave', mensaje: 'Falta la clave' }]);
  });

  it('ante una respuesta sin el formato esperado devuelve un mensaje genérico', () => {
    // El cliente registra la respuesta inesperada en la consola.
    const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const error = leerError(500, '<html>Internal Server Error</html>');
    registro.mockRestore();

    expect(error.codigo).toBe('ERROR_INESPERADO');
    expect(error.status).toBe(500);
    expect(error.mensaje).toBeTruthy();
  });

  it('ante un error del proxy (502/503/504) avisa que no hay conexión', () => {
    // Con la API apagada, el proxy de Vite (y nginx en la demo) responde 502 con
    // un cuerpo HTML: no es un error de la aplicación sino "no llega el servidor".
    const error = leerError(502, '<html></html>');

    expect(error.codigo).toBe('SIN_CONEXION');
    expect(error.mensaje).toBe('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
  });

  it('convierte la falta de conexión en un mensaje para la persona', () => {
    const error = aErrorApi(new TypeError('fetch failed'));

    expect(error.codigo).toBe('SIN_CONEXION');
    expect(error.mensaje).toBe('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
  });

  it('deja pasar los errores de la API tal cual', () => {
    const original = new ErrorApi('El token venció', 'TOKEN_VENCIDO', 401);

    expect(aErrorApi(original)).toBe(original);
  });
});
