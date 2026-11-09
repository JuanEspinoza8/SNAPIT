import { describe, expect, it } from 'vitest';
import {
  debeAvisar,
  destinatariosDelCambio,
  queYDonde,
  resumirEnvio,
  textoCambioEstado,
} from '../src/modulos/avisos/calculo.js';

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

describe('destinatariosDelCambio', () => {
  const ordenar = (lista: { usuarioId: number; tipo: string }[]) =>
    [...lista].sort((a, b) => a.usuarioId - b.usuarioId);

  it('avisa a quienes reportaron y a quienes siguen, una sola vez cada uno', () => {
    // El 2 reportó dos veces y además lo sigue.
    const lista = destinatariosDelCambio({
      reportaron: [1, 2, 2],
      siguen: [2, 3],
      actorId: null,
      nuevo: 'DERIVADO',
    });
    expect(ordenar(lista)).toEqual([
      { usuarioId: 1, tipo: 'CAMBIO_ESTADO' },
      { usuarioId: 2, tipo: 'CAMBIO_ESTADO' },
      { usuarioId: 3, tipo: 'CAMBIO_ESTADO' },
    ]);
  });

  it('al resolverse, quienes lo reportaron reciben el cierre y quienes solo lo siguen, el cambio de estado', () => {
    const lista = destinatariosDelCambio({
      reportaron: [1, 2],
      siguen: [2, 3],
      actorId: null,
      nuevo: 'RESUELTO',
    });
    expect(ordenar(lista)).toEqual([
      { usuarioId: 1, tipo: 'CIERRE' },
      { usuarioId: 2, tipo: 'CIERRE' },
      { usuarioId: 3, tipo: 'CAMBIO_ESTADO' },
    ]);
  });

  it('quien hizo el cambio y quien ya recibió otro aviso por el mismo hecho no se avisan', () => {
    const lista = destinatariosDelCambio({
      reportaron: [1, 2],
      siguen: [3],
      actorId: 3,
      nuevo: 'VERIFICADO',
      yaAvisados: [1],
    });
    expect(lista).toEqual([{ usuarioId: 2, tipo: 'CAMBIO_ESTADO' }]);
  });
});

describe('textos de los avisos', () => {
  it('dicen qué problema es, dónde y en qué estado quedó', () => {
    const problema = queYDonde('Pozo en la calzada', 'Lanín 120, Villa Ceferino');
    expect(textoCambioEstado('CAMBIO_ESTADO', problema, 'EN_EJECUCION').cuerpo).toBe(
      '«Pozo en la calzada» en Lanín 120, Villa Ceferino pasó a en ejecución.',
    );
    expect(textoCambioEstado('CIERRE', queYDonde('Vereda rota', null), 'RESUELTO')).toEqual({
      titulo: 'Se resolvió un problema que reportaste',
      cuerpo: '«Vereda rota» quedó resuelto. Mirá el antes y el después en su ficha.',
    });
  });
});
