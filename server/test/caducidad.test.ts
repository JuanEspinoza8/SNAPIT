import { randomUUID } from 'node:crypto';
import type { EstadoIncidente, TipoVigencia } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/config/logger.js';
import { prisma } from '../src/compartido/prisma.js';
import { caducarIncidentes } from '../src/modulos/incidentes/caducidad.js';
import { listarVencidos } from '../src/modulos/incidentes/repositorio.js';

// Los incidentes cuyo movimiento falla a propósito, después de marcar la fecha.
const conFalla = vi.hoisted(() => new Set<number>());
vi.mock('../src/modulos/incidentes/bitacora.js', async (original) => {
  const real = await original<typeof import('../src/modulos/incidentes/bitacora.js')>();
  return {
    ...real,
    registrarMovimiento: (...args: Parameters<typeof real.registrarMovimiento>) =>
      conFalla.has(args[1].incidenteId)
        ? Promise.reject(new Error('base caída'))
        : real.registrarMovimiento(...args),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const creados: number[] = [];
afterAll(() => prisma.incidente.deleteMany({ where: { id: { in: creados } } }));

let categoriaId: number;
beforeAll(async () => {
  const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  categoriaId = categoria.id;
});

const DIA_MS = 24 * 60 * 60 * 1000;
const haceDias = (dias: number) => new Date(Date.now() - dias * DIA_MS);

/**
 * Un incidente sin reportes, lejos de todo. Por defecto, un temporal verificado que venció ayer. La tarea se
 * prueba con la lista de ids: correrla entera tocaría los vencidos de los otros tests, que corren en paralelo.
 */
async function crearIncidente(
  datos: {
    estado?: EstadoIncidente;
    tipoVigencia?: TipoVigencia;
    vigenteHasta?: Date | null;
    caducadoEn?: Date | null;
    principalId?: number | null;
  } = {},
) {
  const {
    estado = 'VERIFICADO',
    tipoVigencia = 'TEMPORAL',
    vigenteHasta = haceDias(1),
    caducadoEn = null,
    principalId = null,
  } = datos;
  const [fila] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, estado, ubicacion, tipo_vigencia, vigente_hasta, caducado_en,
                           incidente_principal_id, actualizado_en)
    VALUES (${categoriaId}, ${estado}::estado_incidente, ST_SetSRID(ST_MakePoint(170, 80), 4326)::geography,
            ${tipoVigencia}::tipo_vigencia, ${vigenteHasta}, ${caducadoEn}, ${principalId}, ${haceDias(5)})
    RETURNING id`;
  creados.push(fila!.id);
  return fila!.id;
}

const leer = (id: number) =>
  prisma.incidente.findUniqueOrThrow({
    where: { id },
    select: { estado: true, vigenteHasta: true, caducadoEn: true, actualizadoEn: true },
  });

const movimientos = (incidenteId: number) =>
  prisma.movimientoIncidente.findMany({
    where: { incidenteId },
    orderBy: { id: 'asc' },
    select: { tipo: true, usuarioId: true, estadoAnterior: true, estadoNuevo: true, comentario: true },
  });

const MOVIMIENTO = {
  tipo: 'COMENTARIO',
  usuarioId: null,
  estadoAnterior: null,
  estadoNuevo: null,
  comentario: 'Caducó: venció su vigencia.',
};

describe('incidentes por caducar', () => {
  it('trae los temporales vencidos abiertos y deja afuera permanentes, vigentes, cerrados, unidos y caducados', async () => {
    const principal = await crearIncidente({ vigenteHasta: null, tipoVigencia: 'PERMANENTE' });
    const vencidos = [
      await crearIncidente({ estado: 'REGISTRADO' }),
      await crearIncidente({ estado: 'VERIFICADO' }),
      await crearIncidente({ estado: 'DERIVADO' }),
      await crearIncidente({ estado: 'EN_EJECUCION', vigenteHasta: new Date(Date.now() - 1000) }),
    ];
    const afuera = [
      principal,
      await crearIncidente({ tipoVigencia: 'PERMANENTE', vigenteHasta: null }),
      // Un permanente con una fecha cargada no debería existir, pero tampoco caduca.
      await crearIncidente({ tipoVigencia: 'PERMANENTE' }),
      await crearIncidente({ vigenteHasta: new Date(Date.now() + 60_000) }),
      await crearIncidente({ estado: 'RESUELTO' }),
      await crearIncidente({ estado: 'DESESTIMADO' }),
      await crearIncidente({ principalId: principal }),
      await crearIncidente({ caducadoEn: haceDias(1) }),
    ];

    const lista = await listarVencidos();

    expect(lista).toEqual(expect.arrayContaining(vencidos));
    for (const id of afuera) expect(lista).not.toContain(id);
  });
});

describe('caducarIncidentes', () => {
  it('marca la fecha en que venció, sin cambiar el estado, y deja un movimiento del sistema', async () => {
    const vencio = haceDias(2);
    const id = await crearIncidente({ vigenteHasta: vencio });
    const antes = await leer(id);

    expect(await caducarIncidentes([id])).toMatchObject({
      total: 1,
      caducados: 1,
      salteados: 0,
      fallidos: 0,
      duracionMs: expect.any(Number),
    });

    const despues = await leer(id);
    expect(despues).toMatchObject({ estado: 'VERIFICADO', vigenteHasta: vencio, caducadoEn: vencio });
    expect(despues.actualizadoEn.getTime()).toBeGreaterThan(antes.actualizadoEn.getTime());
    expect(await movimientos(id)).toEqual([MOVIMIENTO]);
    expect(await listarVencidos()).not.toContain(id);
  });

  it('correrla dos veces no duplica el movimiento ni cambia la fecha', async () => {
    const id = await crearIncidente();
    await caducarIncidentes([id]);
    const primera = await leer(id);

    expect(await caducarIncidentes([id])).toMatchObject({ total: 1, caducados: 0, salteados: 1 });

    expect(await leer(id)).toEqual(primera);
    expect(await movimientos(id)).toEqual([MOVIMIENTO]);
  });

  it('dos corridas a la vez dejan un solo movimiento', async () => {
    const id = await crearIncidente();

    const resumenes = await Promise.all([caducarIncidentes([id]), caducarIncidentes([id])]);

    expect(resumenes.map((r) => r.caducados).sort()).toEqual([0, 1]);
    expect(await movimientos(id)).toEqual([MOVIMIENTO]);
  });

  it('un permanente nunca caduca, aunque tenga una fecha vencida cargada', async () => {
    const sinFecha = await crearIncidente({ tipoVigencia: 'PERMANENTE', vigenteHasta: null });
    const conFecha = await crearIncidente({ tipoVigencia: 'PERMANENTE' });

    expect(await caducarIncidentes([sinFecha, conFecha])).toMatchObject({ caducados: 0, salteados: 2 });

    for (const id of [sinFecha, conFecha]) {
      expect((await leer(id)).caducadoEn).toBeNull();
      expect(await movimientos(id)).toEqual([]);
    }
  });

  it('saltea los que dejaron de corresponder entre la lista y su turno', async () => {
    const principal = await crearIncidente({ tipoVigencia: 'PERMANENTE', vigenteHasta: null });
    const ids = [
      await crearIncidente({ estado: 'RESUELTO' }),
      await crearIncidente({ estado: 'DESESTIMADO' }),
      await crearIncidente({ principalId: principal }),
      await crearIncidente({ vigenteHasta: new Date(Date.now() + DIA_MS) }),
    ];

    expect(await caducarIncidentes(ids)).toMatchObject({ total: 4, caducados: 0, salteados: 4, fallidos: 0 });

    for (const id of ids) {
      expect((await leer(id)).caducadoEn).toBeNull();
      expect(await movimientos(id)).toEqual([]);
    }
  });

  it('si uno falla, no lo deja a medias, lo deja en el log y sigue con los demás', async () => {
    const falla = await crearIncidente();
    const sigue = await crearIncidente();
    conFalla.add(falla);
    const error = vi.spyOn(logger, 'error');

    try {
      expect(await caducarIncidentes([falla, sigue])).toMatchObject({
        total: 2,
        caducados: 1,
        salteados: 0,
        fallidos: 1,
      });
    } finally {
      conFalla.delete(falla);
    }

    // La fecha se marcó antes del movimiento: la transacción la deshizo.
    expect((await leer(falla)).caducadoEn).toBeNull();
    expect((await leer(sigue)).caducadoEn).not.toBeNull();
    expect(error).toHaveBeenCalledWith(
      { err: expect.any(Error), incidenteId: falla },
      `No se pudo caducar el incidente ${falla}`,
    );
  });
});
