import { describe, expect, it } from 'vitest';
import { debeAvisar, resumirEnvio } from '../src/modulos/avisos/calculo.js';

describe('resumirEnvio', () => {
  it('cuenta los aceptados', () => {
    expect(
      resumirEnvio([
        { token: 'a', aceptado: true },
        { token: 'b', aceptado: true },
      ]),
    ).toEqual({ aceptados: 2, rechazados: [], otrasFallas: [] });
  });

  it('da de baja los tokens que FCM no reconoce o que nunca fueron válidos', () => {
    const resumen = resumirEnvio([
      { token: 'desinstalada', aceptado: false, codigo: 'registration-token-not-registered' },
      { token: 'mal-armado', aceptado: false, codigo: 'invalid-registration-token' },
      { token: 'instalacion', aceptado: false, codigo: 'installation-id-not-registered' },
      { token: 'bien', aceptado: true },
    ]);

    expect(resumen.aceptados).toBe(1);
    expect(resumen.rechazados).toEqual(['desinstalada', 'mal-armado', 'instalacion']);
    expect(resumen.otrasFallas).toEqual([]);
  });

  it('no da de baja por fallas que no son del token', () => {
    const resumen = resumirEnvio([
      { token: 'a', aceptado: false, codigo: 'server-unavailable' },
      // invalid-argument también puede ser un problema del mensaje: apagaría todos los dispositivos.
      { token: 'b', aceptado: false, codigo: 'invalid-argument' },
      { token: 'c', aceptado: false },
    ]);

    expect(resumen.rechazados).toEqual([]);
    expect(resumen.otrasFallas).toEqual([
      { token: 'a', codigo: 'server-unavailable' },
      { token: 'b', codigo: 'invalid-argument' },
      { token: 'c', codigo: 'desconocido' },
    ]);
  });

  it('sin respuestas no cuenta nada', () => {
    expect(resumirEnvio([])).toEqual({ aceptados: 0, rechazados: [], otrasFallas: [] });
  });
});

describe('debeAvisar', () => {
  const habilitado = { dadoDeBaja: false, avisosHabilitados: true, categoriaHabilitada: true };

  it('avisa con todo habilitado', () => {
    expect(debeAvisar(habilitado)).toBe(true);
  });

  it('no avisa con el interruptor general apagado, aunque la categoría esté habilitada', () => {
    expect(debeAvisar({ ...habilitado, avisosHabilitados: false })).toBe(false);
  });

  it('no avisa con la categoría apagada', () => {
    expect(debeAvisar({ ...habilitado, categoriaHabilitada: false })).toBe(false);
  });

  it('no avisa a una cuenta dada de baja', () => {
    expect(debeAvisar({ ...habilitado, dadoDeBaja: true })).toBe(false);
  });
});
