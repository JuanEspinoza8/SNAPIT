import { randomBytes, randomUUID } from 'node:crypto';
import type { Categoria, Usuario } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearUsuario } from './apoyo.js';
import { EXIF_DE_PRUEBA, jpegConExif, jpegSinExif } from './imagenes.js';

let categoria: Categoria;

beforeEach(async () => {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
});

/**
 * La foto de prueba tapada con un mosaico al azar, conservando su EXIF: otra imagen para el hash perceptual.
 * Otros tests suben las mismas fotos de prueba a la base compartida; con una foto única, la verificación no
 * la encuentra repetida (salvo que el test la suba dos veces a propósito).
 */
async function fotoUnica(base: Buffer) {
  const mosaico = await sharp(randomBytes(16 * 12), { raw: { width: 16, height: 12, channels: 1 } })
    .resize(640, 480, { kernel: 'nearest' })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: mosaico }])
    .withMetadata()
    .jpeg()
    .toBuffer();
}

async function reportar(
  vecino: Usuario,
  opciones: { foto?: Buffer; camara?: boolean; lat?: number; lon?: number; registradoEn?: string } = {},
) {
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(categoria.id))
    .field('severidadDeclarada', 'MODERADA')
    .field('lat', String(opciones.lat ?? EXIF_DE_PRUEBA.latitud))
    .field('lon', String(opciones.lon ?? EXIF_DE_PRUEBA.longitud))
    .field('origen', 'APP_MOVIL')
    .field('tomadaConCamaraApp', String(opciones.camara ?? false))
    .field('registradoEn', opciones.registradoEn ?? '2026-10-15T18:00:00Z')
    .attach('foto', opciones.foto ?? jpegConExif(), 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number; nivelConfianza: number; estadoVerificacion: string };
}

const senales = (reporteId: number) =>
  prisma.senalVerificacion.findMany({ where: { reporteId }, orderBy: { id: 'asc' } });

describe('verificación automática al crear el reporte (F04)', () => {
  it('guarda el nivel, el estado y cada señal con su explicación', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    // EXIF en el punto (+20), cámara de la app (+15), reputación inicial (0): 50 + 35 = 85.
    const reporte = await reportar(vecino, { camara: true, foto: await fotoUnica(jpegConExif()) });

    expect(reporte).toMatchObject({ nivelConfianza: 85, estadoVerificacion: 'VERIFICADO' });
    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(guardado).toMatchObject({ nivelConfianza: 85, estadoVerificacion: 'VERIFICADO' });
    const filas = await senales(reporte.id);
    expect(filas.map((s) => [s.tipo, Number(s.valor)])).toEqual([
      ['EXIF_COINCIDE', 20],
      ['ORIGEN_APP', 15],
      ['REPUTACION', 0],
    ]);
    expect(filas.every((s) => s.detalle && s.detalle.length > 0)).toBe(true);
  });

  it('una foto de galería sin EXIF queda pendiente de revisión', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    // Sin EXIF de galería (−10): 50 − 10 = 40.
    const reporte = await reportar(vecino, { foto: await fotoUnica(jpegSinExif()) });

    expect(reporte).toMatchObject({ nivelConfianza: 40, estadoVerificacion: 'PENDIENTE_REVISION' });
    expect((await senales(reporte.id)).map((s) => s.tipo)).toContain('EXIF_AUSENTE');
  });

  it('la misma foto usada en un segundo reporte resta HASH_DUPLICADO, también si es del mismo vecino', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    const foto = await fotoUnica(jpegSinExif());
    const primero = await reportar(vecino, { foto });
    const segundo = await reportar(vecino, { foto, lat: -38.99 });

    expect((await senales(primero.id)).map((s) => s.tipo)).not.toContain('HASH_DUPLICADO');
    const repetida = (await senales(segundo.id)).find((s) => s.tipo === 'HASH_DUPLICADO');
    expect(repetida).toMatchObject({
      detalle: expect.stringContaining(`reporte ${primero.id}, del mismo vecino`),
    });
    // 50 − 10 (sin EXIF) − 40 (repetida) = 0
    expect(segundo.nivelConfianza).toBe(0);
  });

  it('la reputación del vecino suma o resta', async () => {
    const confiable = await crearUsuario({ rol: 'VECINO' });
    await prisma.usuario.update({ where: { id: confiable.id }, data: { reputacion: 100 } });

    const reporte = await reportar(confiable, { foto: await fotoUnica(jpegSinExif()) });

    // 50 − 10 (sin EXIF) + 20 (reputación 100) = 60
    expect(reporte).toMatchObject({ nivelConfianza: 60, estadoVerificacion: 'VERIFICADO' });
  });

  it('el sistema nunca deja un reporte DESESTIMADO por sí solo', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });
    await prisma.usuario.update({ where: { id: vecino.id }, data: { reputacion: 0 } });

    // EXIF lejos del punto (−30), foto repetida (−40) y reputación 0 (−20): 50 − 90 = −40, recortado a 0.
    await reportar(vecino);
    const peor = await reportar(vecino, { lat: -38.99 });

    expect(peor.nivelConfianza).toBe(0);
    expect(peor.estadoVerificacion).toBe('PENDIENTE_REVISION');
  });
});
