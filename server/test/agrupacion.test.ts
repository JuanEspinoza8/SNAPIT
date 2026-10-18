import { randomUUID } from 'node:crypto';
import type { Categoria, Severidad } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { alCambiarIncidente } from '../src/modulos/incidentes/eventos.js';
import { crearUsuario } from './apoyo.js';
import { jpegConExif, jpegSinExif } from './imagenes.js';

// Unos 20 m al norte: con la misma foto se agrupa (0,17 + 0,2 + 0,3 = 0,67); con otra, no (0,37).
const VEINTE_METROS = 0.00018;

let categoria: Categoria;
// Cada test en su propio lugar del mapa, para que no se agrupe con reportes de otros tests.
let lat: number;
const lon = -68.06;

beforeEach(async () => {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  lat = -38.9 - Math.random() * 0.2;
});

async function reportar(
  opciones: { severidad?: Severidad; foto?: Buffer; desplazamiento?: number; categoriaId?: number } = {},
) {
  const { severidad = 'MODERADA', foto = jpegConExif(), desplazamiento = 0 } = opciones;
  const vecino = await crearUsuario({ rol: 'VECINO' });
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(opciones.categoriaId ?? categoria.id))
    .field('severidadDeclarada', severidad)
    .field('lat', String(lat + desplazamiento))
    .field('lon', String(lon))
    .field('origen', 'APP_MOVIL')
    .attach('foto', foto, 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number };
}

const incidente = (id: number) => prisma.incidente.findUniqueOrThrow({ where: { id } });

describe('agrupación de reportes en incidentes (F05)', () => {
  it('tres reportes cercanos de la misma categoría quedan en un incidente con cantidad_reportes = 3', async () => {
    const primero = await reportar();
    const segundo = await reportar({ desplazamiento: 0.00005 });
    const tercero = await reportar({ desplazamiento: -0.00005 });

    expect(segundo.incidenteId).toBe(primero.incidenteId);
    expect(tercero.incidenteId).toBe(primero.incidenteId);
    expect(await incidente(primero.incidenteId)).toMatchObject({ cantidadReportes: 3 });
    expect(await prisma.reporte.count({ where: { incidenteId: primero.incidenteId } })).toBe(3);
  });

  it('un reporte solo crea su incidente con cantidad_reportes = 1', async () => {
    const solo = await reportar();

    expect(await incidente(solo.incidenteId)).toMatchObject({ cantidadReportes: 1, severidad: 'MODERADA' });
  });

  it('otra categoría en el mismo lugar abre otro incidente', async () => {
    const otra = await prisma.categoria.create({
      data: { nombre: `Categoría ${randomUUID()}`, areaId: categoria.areaId },
    });

    const pozo = await reportar();
    const vereda = await reportar({ categoriaId: otra.id });

    expect(vereda.incidenteId).not.toBe(pozo.incidenteId);
  });

  it('a 20 m la foto decide: la misma se agrupa, otra distinta abre un incidente nuevo', async () => {
    const primero = await reportar({ foto: jpegConExif() });
    const mismaFoto = await reportar({ foto: jpegConExif(), desplazamiento: VEINTE_METROS });
    const otraFoto = await reportar({ foto: jpegSinExif(), desplazamiento: VEINTE_METROS });

    expect(mismaFoto.incidenteId).toBe(primero.incidenteId);
    expect(otraFoto.incidenteId).not.toBe(primero.incidenteId);
  });

  it('a 100 m no se agrupa aunque sea la misma foto', async () => {
    const primero = await reportar();
    const lejos = await reportar({ desplazamiento: 0.0009 });

    expect(lejos.incidenteId).not.toBe(primero.incidenteId);
  });

  it('un incidente resuelto no recibe reportes nuevos', async () => {
    const primero = await reportar();
    await prisma.incidente.update({ where: { id: primero.incidenteId }, data: { estado: 'RESUELTO' } });

    const nuevo = await reportar();

    expect(nuevo.incidenteId).not.toBe(primero.incidenteId);
  });

  it('un incidente unido a otro no recibe reportes nuevos', async () => {
    const principal = await reportar({ desplazamiento: 0.01 });
    const unido = await reportar();
    await prisma.incidente.update({
      where: { id: unido.incidenteId },
      data: { incidentePrincipalId: principal.incidenteId },
    });

    const nuevo = await reportar();

    expect(nuevo.incidenteId).not.toBe(unido.incidenteId);
  });

  it('la severidad consolidada es la más declarada, y ante un empate la más alta', async () => {
    const primero = await reportar({ severidad: 'LEVE' });
    await reportar({ severidad: 'GRAVE' });
    expect((await incidente(primero.incidenteId)).severidad).toBe('GRAVE');

    await reportar({ severidad: 'LEVE' });
    expect((await incidente(primero.incidenteId)).severidad).toBe('LEVE');
  });

  it('los reportes desestimados no cuentan para la severidad', async () => {
    const grave = await reportar({ severidad: 'GRAVE' });
    await prisma.reporte.update({ where: { id: grave.id }, data: { estadoVerificacion: 'DESESTIMADO' } });

    await reportar({ severidad: 'LEVE' });

    expect((await incidente(grave.incidenteId)).severidad).toBe('LEVE');
  });

  it('avisa al módulo de prioridad dentro de la misma transacción', async () => {
    const avisos: number[] = [];
    const suscripto = vi.fn(async (_tx: unknown, incidenteId: number) => {
      avisos.push(incidenteId);
    });
    alCambiarIncidente(suscripto);

    const primero = await reportar();
    await reportar();

    expect(avisos.filter((id) => id === primero.incidenteId)).toHaveLength(2);
  });

  it('dos reportes del mismo lugar que llegan a la vez terminan en el mismo incidente', async () => {
    const [uno, dos] = await Promise.all([reportar(), reportar()]);

    expect(dos.incidenteId).toBe(uno.incidenteId);
    expect(await incidente(uno.incidenteId)).toMatchObject({ cantidadReportes: 2 });
  });
});
