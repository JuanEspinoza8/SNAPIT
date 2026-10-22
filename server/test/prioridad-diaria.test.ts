import { randomUUID } from 'node:crypto';
import type { EstadoIncidente } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/config/logger.js';
import { prisma } from '../src/compartido/prisma.js';
import { listarAbiertos } from '../src/modulos/prioridad/repositorio.js';
import { recalcularIncidentes } from '../src/modulos/prioridad/servicio.js';

// Los incidentes cuyo recálculo falla a propósito, a mitad de camino.
const conFalla = vi.hoisted(() => new Set<number>());
vi.mock('../src/modulos/prioridad/repositorio.js', async (original) => {
  const real = await original<typeof import('../src/modulos/prioridad/repositorio.js')>();
  return {
    ...real,
    puntosCercanos: (...args: Parameters<typeof real.puntosCercanos>) =>
      conFalla.has(args[1]) ? Promise.reject(new Error('base caída')) : real.puntosCercanos(...args),
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
 * Un incidente sin reportes ni desglose, en un punto sin puntos de interés y fuera de los cuadrados que usa
 * incidentes.test.ts.
 */
async function crearIncidente(
  datos: {
    estado?: EstadoIncidente;
    primerReporteEn?: Date;
    caducadoEn?: Date | null;
    vigenteHasta?: Date | null;
    principalId?: number | null;
  } = {},
) {
  const {
    estado = 'VERIFICADO',
    primerReporteEn = new Date(),
    caducadoEn = null,
    vigenteHasta = null,
    principalId = null,
  } = datos;
  const [fila] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, estado, ubicacion, primer_reporte_en, caducado_en,
                           tipo_vigencia, vigente_hasta, incidente_principal_id, cantidad_reportes)
    VALUES (${categoriaId}, ${estado}::estado_incidente,
            ST_SetSRID(ST_MakePoint(170, 80), 4326)::geography, ${primerReporteEn}, ${caducadoEn},
            ${vigenteHasta ? 'TEMPORAL' : 'PERMANENTE'}::tipo_vigencia, ${vigenteHasta}, ${principalId}, 1)
    RETURNING id`;
  creados.push(fila!.id);
  return fila!.id;
}

async function prioridad(incidenteId: number) {
  const incidente = await prisma.incidente.findUniqueOrThrow({
    where: { id: incidenteId },
    select: { puntajePrioridad: true },
  });
  const factores = await prisma.factorPrioridad.findMany({
    where: { incidenteId },
    orderBy: { id: 'asc' },
    select: { factor: true, valor: true, detalle: true },
  });
  return {
    puntaje: Number(incidente.puntajePrioridad),
    factores: factores.map((f) => ({ ...f, valor: Number(f.valor) })),
  };
}

describe('incidentes del recálculo diario', () => {
  it('trae los abiertos y deja afuera los resueltos, desestimados, unidos, caducados y vencidos', async () => {
    const principal = await crearIncidente();
    const abiertos = [
      principal,
      await crearIncidente({ estado: 'REGISTRADO' }),
      await crearIncidente({ estado: 'DERIVADO' }),
      await crearIncidente({ estado: 'EN_EJECUCION' }),
      await crearIncidente({ vigenteHasta: new Date(Date.now() + DIA_MS) }),
    ];
    const afuera = [
      await crearIncidente({ estado: 'RESUELTO' }),
      await crearIncidente({ estado: 'DESESTIMADO' }),
      await crearIncidente({ principalId: principal }),
      await crearIncidente({ caducadoEn: haceDias(1), vigenteHasta: haceDias(1) }),
      await crearIncidente({ vigenteHasta: haceDias(1) }),
    ];

    const lista = await listarAbiertos();

    expect(lista).toEqual(expect.arrayContaining(abiertos));
    for (const id of afuera) expect(lista).not.toContain(id);
  });
});

describe('recalcularIncidentes', () => {
  it('actualiza la antigüedad y reemplaza el desglose del día anterior', async () => {
    const id = await crearIncidente({ primerReporteEn: haceDias(10.5) });

    expect(await recalcularIncidentes([id])).toMatchObject({
      total: 1,
      recalculados: 1,
      salteados: 0,
      fallidos: 0,
    });
    // 20 × 10 / 60
    let { puntaje, factores } = await prioridad(id);
    expect(factores[2]).toEqual({
      factor: 'ANTIGUEDAD',
      valor: 3.33,
      detalle: 'Lleva 10 días sin resolverse: +3,3',
    });
    expect(puntaje).toBe(36.25);

    // Al otro día.
    await prisma.incidente.update({ where: { id }, data: { primerReporteEn: haceDias(11.5) } });
    await recalcularIncidentes([id]);

    ({ puntaje, factores } = await prioridad(id));
    expect(factores).toHaveLength(4);
    expect(factores[2]).toEqual({
      factor: 'ANTIGUEDAD',
      valor: 3.67,
      detalle: 'Lleva 11 días sin resolverse: +3,7',
    });
    expect(puntaje).toBe(36.59);
  });

  it('si falla con un incidente, sigue con los demás y deja el error en el log', async () => {
    const error = vi.spyOn(logger, 'error');
    const [primero, segundo, tercero] = [
      await crearIncidente({ primerReporteEn: haceDias(3) }),
      await crearIncidente({ primerReporteEn: haceDias(3) }),
      await crearIncidente({ primerReporteEn: haceDias(3) }),
    ];
    conFalla.add(segundo!);

    const resumen = await recalcularIncidentes([primero!, segundo!, tercero!]);

    expect(resumen).toMatchObject({ total: 3, recalculados: 2, fallidos: 1 });
    expect((await prioridad(primero!)).factores).toHaveLength(4);
    expect((await prioridad(tercero!)).factores).toHaveLength(4);
    // Su transacción se deshizo: quedó como estaba.
    expect(await prioridad(segundo!)).toEqual({ puntaje: 0, factores: [] });
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      { err: expect.objectContaining({ message: 'base caída' }), incidenteId: segundo },
      `No se pudo recalcular la prioridad del incidente ${segundo}`,
    );
  });

  it('saltea los que se cerraron, unieron o caducaron después de armar la lista', async () => {
    const principal = await crearIncidente();
    const ids = [
      await crearIncidente({ estado: 'RESUELTO', primerReporteEn: haceDias(5) }),
      await crearIncidente({ principalId: principal, primerReporteEn: haceDias(5) }),
      await crearIncidente({ vigenteHasta: haceDias(1), primerReporteEn: haceDias(5) }),
    ];

    expect(await recalcularIncidentes(ids)).toMatchObject({
      total: 3,
      recalculados: 0,
      salteados: 3,
      fallidos: 0,
    });
    for (const id of ids) expect(await prioridad(id)).toEqual({ puntaje: 0, factores: [] });
  });
});
