import { randomUUID } from 'node:crypto';
import type { EstadoIncidente, EstadoVerificacion } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/compartido/prisma.js';
import { cargarSocial } from '../src/semilla/cargarSocial.js';
import { crearUsuario } from './apoyo.js';

const incidentes: number[] = [];

async function crearIncidente(categoriaId: number, estado: EstadoIncidente = 'VERIFICADO') {
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, estado, ubicacion)
    VALUES (${categoriaId}, ${estado}::estado_incidente, ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography)
    RETURNING id`) as [{ id: number }];
  incidentes.push(id);
  return id;
}

async function crearReporte(
  incidenteId: number,
  categoriaId: number,
  usuarioId: number,
  estado: EstadoVerificacion = 'VERIFICADO',
) {
  const [{ id }] = (await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO reporte (incidente_id, usuario_id, categoria_id, severidad_declarada, ubicacion, origen,
                         estado_verificacion)
    VALUES (${incidenteId}, ${usuarioId}, ${categoriaId}, 'LEVE',
            ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography, 'APP_MOVIL', ${estado}::estado_verificacion)
    RETURNING id`) as [{ id: number }];
  return id;
}

/** Una categoría, cinco vecinos y un incidente visible con tres reportes de autores distintos. */
async function escenario() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  const vecinos = await Promise.all([1, 2, 3, 4, 5].map(() => crearUsuario()));
  const visible = await crearIncidente(categoria.id);
  const reportes = await Promise.all(
    vecinos.slice(0, 3).map((v) => crearReporte(visible, categoria.id, v.id)),
  );
  return { categoria, vecinos, visible, reportes };
}

afterAll(async () => {
  await prisma.comentario.deleteMany({ where: { incidenteId: { in: incidentes } } });
  await prisma.reporte.deleteMany({ where: { incidenteId: { in: incidentes } } });
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
});

describe('semilla social', () => {
  it('da likes y comentarios de otros vecinos, nunca del autor del reporte', async () => {
    const { vecinos, visible, reportes } = await escenario();

    const totales = await cargarSocial(prisma, {
      usuarioIds: vecinos.map((v) => v.id),
      incidenteIds: [visible],
    });

    expect(totales.reportes).toBe(3);
    expect(totales.likes).toBeGreaterThan(0);
    expect(totales.comentarios).toBeGreaterThan(0);
    const likes = await prisma.meGustaReporte.findMany({
      where: { reporteId: { in: reportes } },
      include: { reporte: { select: { usuarioId: true } } },
    });
    for (const like of likes) expect(like.usuarioId).not.toBe(like.reporte.usuarioId);
    // Cada reporte recibe al menos uno.
    expect(new Set(likes.map((l) => l.reporteId)).size).toBe(3);
    expect(await prisma.comentario.count({ where: { incidenteId: visible } })).toBeGreaterThan(0);
  });

  it('correrla dos veces no duplica nada', async () => {
    const { vecinos, visible, reportes } = await escenario();
    const opciones = { usuarioIds: vecinos.map((v) => v.id), incidenteIds: [visible] };

    await cargarSocial(prisma, opciones);
    const antes = await Promise.all([
      prisma.meGustaReporte.count({ where: { reporteId: { in: reportes } } }),
      prisma.comentario.count({ where: { OR: [{ reporteId: { in: reportes } }, { incidenteId: visible }] } }),
    ]);
    const segunda = await cargarSocial(prisma, opciones);
    const despues = await Promise.all([
      prisma.meGustaReporte.count({ where: { reporteId: { in: reportes } } }),
      prisma.comentario.count({ where: { OR: [{ reporteId: { in: reportes } }, { incidenteId: visible }] } }),
    ]);

    expect(segunda).toMatchObject({ likes: 0, comentarios: 0 });
    expect(despues).toEqual(antes);
  });

  it('no toca reportes desestimados ni incidentes que no se ven', async () => {
    const { categoria, vecinos, visible } = await escenario();
    const desestimado = await crearReporte(visible, categoria.id, vecinos[3]!.id, 'DESESTIMADO');
    const oculto = await crearIncidente(categoria.id, 'DESESTIMADO');
    const delOculto = await crearReporte(oculto, categoria.id, vecinos[4]!.id);

    await cargarSocial(prisma, { usuarioIds: vecinos.map((v) => v.id), incidenteIds: [visible, oculto] });

    expect(
      await prisma.meGustaReporte.count({ where: { reporteId: { in: [desestimado, delOculto] } } }),
    ).toBe(0);
    expect(
      await prisma.comentario.count({
        where: { OR: [{ reporteId: { in: [desestimado, delOculto] } }, { incidenteId: oculto }] },
      }),
    ).toBe(0);
  });
});
