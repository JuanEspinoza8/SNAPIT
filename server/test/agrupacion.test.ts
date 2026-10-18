import { randomUUID } from 'node:crypto';
import type { Categoria, Severidad } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { calcularHashPerceptual, contarUnos, distanciaHamming } from '../src/compartido/hashPerceptual.js';
import { alCambiarIncidente } from '../src/modulos/incidentes/eventos.js';
import { crearUsuario } from './apoyo.js';
import { escenaNocturna, jpegConExif, jpegSinExif } from './imagenes.js';

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

interface OpcionesReporte {
  severidad?: Severidad;
  foto?: Buffer;
  desplazamiento?: number;
  categoriaId?: number;
  registradoEn?: string;
}

async function enviar(opciones: OpcionesReporte = {}) {
  const { severidad = 'MODERADA', foto = jpegConExif(), desplazamiento = 0 } = opciones;
  const vecino = await crearUsuario({ rol: 'VECINO' });
  let pedido = request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(opciones.categoriaId ?? categoria.id))
    .field('severidadDeclarada', severidad)
    .field('lat', String(lat + desplazamiento))
    .field('lon', String(lon))
    .field('origen', 'APP_MOVIL');
  if (opciones.registradoEn) pedido = pedido.field('registradoEn', opciones.registradoEn);
  return { vecino, res: await pedido.attach('foto', foto, 'foto.jpg') };
}

async function reportar(opciones: OpcionesReporte = {}) {
  const { res } = await enviar(opciones);
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number };
}

const incidente = (id: number) => prisma.incidente.findUniqueOrThrow({ where: { id } });

const DIA_MS = 24 * 60 * 60 * 1000;
const haceDias = (dias: number) => new Date(Date.now() - dias * DIA_MS);

/** Corre la llegada (y la carga) de los reportes del incidente `dias` días hacia atrás. */
const envejecer = (incidenteId: number, dias: number) =>
  prisma.reporte.updateMany({
    where: { incidenteId },
    data: { registradoEn: haceDias(dias), sincronizadoEn: haceDias(dias) },
  });

/** Une a mano un incidente a otro, como lo va a hacer la #54. */
const unir = (duplicadoId: number, principalId: number) =>
  prisma.incidente.update({ where: { id: duplicadoId }, data: { incidentePrincipalId: principalId } });

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
    const primero = await reportar({ severidad: 'GRAVE' });
    const segundo = await reportar({ severidad: 'GRAVE' });
    await reportar({ severidad: 'LEVE' });
    await prisma.reporte.updateMany({
      where: { id: { in: [primero.id, segundo.id] } },
      data: { estadoVerificacion: 'DESESTIMADO' },
    });

    await reportar({ severidad: 'LEVE' });

    // Con los desestimados serían dos GRAVE y dos LEVE, y ante el empate quedaría GRAVE.
    expect((await incidente(primero.incidenteId)).severidad).toBe('LEVE');
  });

  it('un incidente con todos sus reportes desestimados no recibe reportes nuevos', async () => {
    const primero = await reportar();
    await prisma.reporte.update({ where: { id: primero.id }, data: { estadoVerificacion: 'DESESTIMADO' } });

    const nuevo = await reportar();

    expect(nuevo.incidenteId).not.toBe(primero.incidenteId);
  });

  it('la severidad suma los reportes de los incidentes que se le unieron', async () => {
    const principal = await reportar({ severidad: 'LEVE' });
    const duplicado = await reportar({ severidad: 'GRAVE', desplazamiento: 0.01 });
    await reportar({ severidad: 'GRAVE', desplazamiento: 0.01 });
    await unir(duplicado.incidenteId, principal.incidenteId);

    await reportar({ severidad: 'LEVE' });

    // Dos LEVE en el principal y dos GRAVE en el unido: empate, la más alta.
    expect((await incidente(principal.incidenteId)).severidad).toBe('GRAVE');
  });

  it('el último reporte y la foto más parecida salen también de los incidentes unidos', async () => {
    const principal = await reportar({ foto: jpegSinExif() });
    await envejecer(principal.incidenteId, 40);
    const duplicado = await reportar({ foto: jpegConExif(), desplazamiento: 0.01 });
    await unir(duplicado.incidenteId, principal.incidenteId);

    // A 20 m: el reporte del principal está fuera de la ventana y su foto es otra. Lo que lo hace candidato
    // y le da el parecido es el reporte del unido: 0,17 + 0,2 + 0,3 = 0,67.
    const nuevo = await reportar({ foto: jpegConExif(), desplazamiento: VEINTE_METROS });

    expect(nuevo.incidenteId).toBe(principal.incidenteId);
  });

  it('una fecha vieja mandada por el celular no revive un incidente fuera de la ventana', async () => {
    const viejo = await reportar();
    await envejecer(viejo.incidenteId, 31);

    // Si la ventana se midiera con registradoEn, este reporte "de hace 32 días" quedaría junto al anterior.
    const nuevo = await reportar({ registradoEn: haceDias(32).toISOString() });

    expect(nuevo.incidenteId).not.toBe(viejo.incidenteId);
  });

  it('dos fotos oscuras distintas a 20 m no se agrupan por parecerse', async () => {
    const [foto1, foto2] = await Promise.all([escenaNocturna(100, 80), escenaNocturna(500, 120)]);
    const [hash1, hash2] = await Promise.all([calcularHashPerceptual(foto1), calcularHashPerceptual(foto2)]);
    // Sin la regla de los unos mínimos, 14 bits darían 0,17 + 0,2 + 0,17 = 0,54 y se agruparían.
    expect(distanciaHamming(hash1, hash2)).toBeLessThanOrEqual(14);
    expect(contarUnos(hash1)).toBeLessThan(16);

    const primero = await reportar({ foto: foto1 });
    const segundo = await reportar({ foto: foto2, desplazamiento: VEINTE_METROS });

    expect(segundo.incidenteId).not.toBe(primero.incidenteId);
  });

  it('avisa al módulo de prioridad cada vez que se suma un reporte', async () => {
    const avisos: number[] = [];
    const suscripto = vi.fn(async (_tx: unknown, incidenteId: number) => {
      avisos.push(incidenteId);
    });
    const quitar = alCambiarIncidente(suscripto);

    try {
      const primero = await reportar();
      await reportar();

      expect(avisos.filter((id) => id === primero.incidenteId)).toHaveLength(2);
    } finally {
      quitar();
    }
  });

  it('si falla el recálculo de la prioridad, no queda nada: ni el reporte ni el cambio del incidente', async () => {
    const primero = await reportar({ severidad: 'LEVE' });
    const quitar = alCambiarIncidente(async () => {
      throw new Error('prioridad caída');
    });

    let resultado: Awaited<ReturnType<typeof enviar>>;
    try {
      resultado = await enviar({ severidad: 'GRAVE' });
    } finally {
      quitar();
    }

    expect(resultado.res.status).toBe(500);
    expect(await prisma.reporte.count({ where: { usuarioId: resultado.vecino.id } })).toBe(0);
    expect(await incidente(primero.incidenteId)).toMatchObject({ cantidadReportes: 1, severidad: 'LEVE' });
  });

  it('dos reportes del mismo lugar que llegan a la vez terminan en el mismo incidente', async () => {
    const [uno, dos] = await Promise.all([reportar(), reportar()]);

    expect(dos.incidenteId).toBe(uno.incidenteId);
    expect(await incidente(uno.incidenteId)).toMatchObject({ cantidadReportes: 2 });
  });
});
