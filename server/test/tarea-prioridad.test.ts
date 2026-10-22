import cron from 'node-cron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/config/logger.js';
import { listarAbiertos } from '../src/modulos/prioridad/repositorio.js';
import { recalcularIncidentes, type ResumenRecalculo } from '../src/modulos/prioridad/servicio.js';
import {
  correrPrioridadDiaria,
  HORARIO,
  iniciarPrioridadDiaria,
  ZONA_HORARIA,
} from '../src/tareas/prioridadDiaria.js';

// Sin base: la lista y el recálculo se prueban en prioridad-diaria.test.ts.
vi.mock('../src/modulos/prioridad/repositorio.js', () => ({ listarAbiertos: vi.fn() }));
vi.mock('../src/modulos/prioridad/servicio.js', () => ({ recalcularIncidentes: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function devolver(ids: number[], resumen: Partial<ResumenRecalculo>) {
  vi.mocked(listarAbiertos).mockResolvedValue(ids);
  vi.mocked(recalcularIncidentes).mockResolvedValue({
    total: ids.length,
    recalculados: ids.length,
    salteados: 0,
    fallidos: 0,
    duracionMs: 42,
    ...resumen,
  });
}

describe('correrPrioridadDiaria', () => {
  it('recalcula los abiertos y deja en el log cuántos fueron y cuánto tardó', async () => {
    devolver([3, 5, 8], {});
    const info = vi.spyOn(logger, 'info');

    const resumen = await correrPrioridadDiaria();

    expect(recalcularIncidentes).toHaveBeenCalledWith([3, 5, 8]);
    expect(info).toHaveBeenCalledWith(
      resumen,
      'Prioridad diaria: se recalcularon 3 de 3 incidentes en 42 ms',
    );
  });

  it('aclara cuántos se saltearon y cuántos fallaron', async () => {
    devolver([3, 5, 8, 13, 21], { recalculados: 2, salteados: 1, fallidos: 2 });
    const info = vi.spyOn(logger, 'info');

    await correrPrioridadDiaria();

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ fallidos: 2 }),
      'Prioridad diaria: se recalcularon 2 de 5 incidentes en 42 ms (1 ya no estaba abierto, 2 fallaron)',
    );
  });

  it('si no puede armar la lista, lo deja en el log y devuelve null', async () => {
    const falla = new Error('base caída');
    vi.mocked(listarAbiertos).mockRejectedValue(falla);
    const error = vi.spyOn(logger, 'error');

    expect(await correrPrioridadDiaria()).toBeNull();
    expect(recalcularIncidentes).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith({ err: falla }, 'Falló el recálculo diario de prioridad');
  });
});

describe('iniciarPrioridadDiaria', () => {
  it('corre al arrancar y queda programada para todos los días a las 03:00 de Argentina', async () => {
    devolver([], {});

    iniciarPrioridadDiaria();

    expect(cron.schedule).toHaveBeenCalledWith('0 3 * * *', correrPrioridadDiaria, {
      timezone: 'America/Argentina/Buenos_Aires',
      name: 'prioridad-diaria',
    });
    await vi.waitFor(() => expect(recalcularIncidentes).toHaveBeenCalledOnce());
  });

  it('las 03:00 de Argentina son las 06:00 UTC, que es la hora del contenedor de Docker', async () => {
    const real = await vi.importActual<typeof import('node-cron')>('node-cron');
    const tarea = real.createTask(HORARIO, () => {}, { timezone: ZONA_HORARIA });

    expect(tarea.match(new Date('2026-10-22T06:00:00Z'))).toBe(true);
    expect(tarea.match(new Date('2026-10-22T03:00:00Z'))).toBe(false);
    await tarea.destroy();
  });
});
