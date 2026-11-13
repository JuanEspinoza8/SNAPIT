import cron from 'node-cron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/config/logger.js';
import { caducarIncidentes, type ResumenCaducidad } from '../src/modulos/incidentes/caducidad.js';
import { listarVencidos } from '../src/modulos/incidentes/repositorio.js';
import { correrCaducidadDiaria, iniciarCaducidadDiaria } from '../src/tareas/caducidadDiaria.js';

// Sin base: la lista y la caducidad se prueban en caducidad.test.ts.
vi.mock('../src/modulos/incidentes/repositorio.js', async (original) => ({
  ...(await original<typeof import('../src/modulos/incidentes/repositorio.js')>()),
  listarVencidos: vi.fn(),
}));
vi.mock('../src/modulos/incidentes/caducidad.js', () => ({ caducarIncidentes: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function devolver(ids: number[], resumen: Partial<ResumenCaducidad>) {
  vi.mocked(listarVencidos).mockResolvedValue(ids);
  vi.mocked(caducarIncidentes).mockResolvedValue({
    total: ids.length,
    caducados: ids.length,
    salteados: 0,
    fallidos: 0,
    duracionMs: 42,
    ...resumen,
  });
}

describe('correrCaducidadDiaria', () => {
  it('caduca los vencidos y deja en el log cuántos fueron y cuánto tardó', async () => {
    devolver([3, 5, 8], {});
    const info = vi.spyOn(logger, 'info');

    const resumen = await correrCaducidadDiaria();

    expect(caducarIncidentes).toHaveBeenCalledWith([3, 5, 8]);
    expect(info).toHaveBeenCalledWith(
      resumen,
      'Caducidad diaria: caducaron 3 de 3 incidentes vencidos en 42 ms',
    );
  });

  it('aclara cuántos se saltearon y cuántos fallaron', async () => {
    devolver([3, 5, 8, 13, 21], { caducados: 2, salteados: 1, fallidos: 2 });
    const info = vi.spyOn(logger, 'info');

    await correrCaducidadDiaria();

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ fallidos: 2 }),
      'Caducidad diaria: caducaron 2 de 5 incidentes vencidos en 42 ms (1 ya no correspondía, 2 fallaron)',
    );
  });

  it('si no puede armar la lista, lo deja en el log y devuelve null', async () => {
    const falla = new Error('base caída');
    vi.mocked(listarVencidos).mockRejectedValue(falla);
    const error = vi.spyOn(logger, 'error');

    expect(await correrCaducidadDiaria()).toBeNull();
    expect(caducarIncidentes).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith({ err: falla }, 'Falló la caducidad diaria');
  });
});

describe('iniciarCaducidadDiaria', () => {
  it('corre al arrancar y queda programada para todos los días a las 03:00 de Argentina', async () => {
    devolver([], {});

    iniciarCaducidadDiaria();

    expect(cron.schedule).toHaveBeenCalledWith('0 3 * * *', correrCaducidadDiaria, {
      timezone: 'America/Argentina/Buenos_Aires',
      name: 'caducidad-diaria',
    });
    await vi.waitFor(() => expect(caducarIncidentes).toHaveBeenCalledOnce());
  });
});
