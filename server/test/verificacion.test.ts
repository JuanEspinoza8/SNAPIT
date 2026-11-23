import { randomUUID } from 'node:crypto';
import type { Categoria, Usuario } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearUsuario } from './apoyo.js';
import { EXIF_DE_PRUEBA, escenaNocturna, fotoUnica, jpegConExif, jpegLiso, jpegSinExif } from './imagenes.js';

let categoria: Categoria;

beforeEach(async () => {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
});

let ultimoRegistro = Date.parse('2026-10-15T18:00:00Z');
const registradoEnUnico = () => new Date((ultimoRegistro += 60_000)).toISOString();

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
    .field('registradoEn', opciones.registradoEn ?? registradoEnUnico())
    .attach('foto', opciones.foto ?? jpegConExif(), 'foto.jpg');
  expect(res.status).toBe(201);
  return res.body as { id: number; incidenteId: number; nivelConfianza: number; estadoVerificacion: string };
}

const senales = (reporteId: number) =>
  prisma.senalVerificacion.findMany({ where: { reporteId }, orderBy: { id: 'asc' } });

describe('controles automáticos al crear el reporte (F04)', () => {
  it('todo reporte llega pendiente, con el nivel y una señal por control con su explicación', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    // EXIF en el punto, del mismo día y una foto que no se usó antes: se cumplen los tres controles.
    const reporte = await reportar(vecino, { camara: true, foto: await fotoUnica(jpegConExif()) });

    expect(reporte).toMatchObject({ nivelConfianza: 100, estadoVerificacion: 'PENDIENTE_REVISION' });
    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(guardado).toMatchObject({ nivelConfianza: 100, estadoVerificacion: 'PENDIENTE_REVISION' });
    const filas = await senales(reporte.id);
    expect(filas.map((s) => [s.tipo, Number(s.valor)])).toEqual([
      ['EXIF_COINCIDE', 1],
      ['FECHA_ANTIGUA', 1],
      ['HASH_DUPLICADO', 1],
    ]);
    expect(filas.every((s) => s.detalle && s.detalle.length > 0)).toBe(true);
  });

  it('una foto sin EXIF no tiene con qué comprobar la ubicación ni la fecha', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    const reporte = await reportar(vecino, { foto: await fotoUnica(jpegSinExif()) });

    expect(reporte).toMatchObject({ nivelConfianza: 33, estadoVerificacion: 'PENDIENTE_REVISION' });
    expect((await senales(reporte.id)).map((s) => [s.tipo, Number(s.valor)])).toEqual([
      ['EXIF_AUSENTE', 0],
      ['FECHA_ANTIGUA', 0],
      ['HASH_DUPLICADO', 1],
    ]);
  });

  it('la misma foto usada en un segundo reporte no cumple HASH_DUPLICADO, también si es del mismo vecino', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    const foto = await fotoUnica(jpegSinExif());
    const primero = await reportar(vecino, { foto });
    const segundo = await reportar(vecino, { foto, lat: -38.99 });

    const repetida = async (id: number) => (await senales(id)).find((s) => s.tipo === 'HASH_DUPLICADO');
    expect(Number((await repetida(primero.id))?.valor)).toBe(1);
    expect(await repetida(segundo.id)).toMatchObject({
      detalle: expect.stringContaining(`reporte ${primero.id}, del mismo vecino`),
    });
    expect(Number((await repetida(segundo.id))?.valor)).toBe(-1);
    expect(segundo.nivelConfianza).toBe(0);
  });

  it('dos fotos lisas distintas no cuentan como la misma foto: no se pueden comparar', async () => {
    const [vecino, otro] = await Promise.all([
      crearUsuario({ rol: 'VECINO' }),
      crearUsuario({ rol: 'VECINO' }),
    ]);

    // Las dos tienen el hash de 64 ceros, igual que cualquier otra foto lisa ya guardada por otros tests.
    await reportar(vecino, { camara: true, foto: await jpegLiso(0) });
    const segundo = await reportar(otro, { camara: true, foto: await jpegLiso(255), lat: -38.99 });

    const control = (await senales(segundo.id)).find((s) => s.tipo === 'HASH_DUPLICADO');
    expect(Number(control?.valor)).toBe(0);
    expect(control?.detalle).toContain('lisa u oscura');
  });

  it('una foto oscura con algo de información sí se detecta si se repite', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });
    const foto = await escenaNocturna(320, 60);

    await reportar(vecino, { foto });
    const segundo = await reportar(vecino, { foto, lat: -38.99 });

    const control = (await senales(segundo.id)).find((s) => s.tipo === 'HASH_DUPLICADO');
    expect(Number(control?.valor)).toBe(-1);
  });

  it('desde el sitio web la foto no puede venir de la cámara de la app: 400', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    const res = await request(app)
      .post('/api/reportes')
      .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
      .field('categoriaId', String(categoria.id))
      .field('severidadDeclarada', 'MODERADA')
      .field('lat', String(EXIF_DE_PRUEBA.latitud))
      .field('lon', String(EXIF_DE_PRUEBA.longitud))
      .field('origen', 'SITIO_WEB')
      .field('tomadaConCamaraApp', 'true')
      .attach('foto', await fotoUnica(jpegSinExif()), 'foto.jpg');

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      {
        campo: 'tomadaConCamaraApp',
        mensaje: 'Desde el sitio web la foto no puede ser de la cámara de la app',
      },
    ]);
    expect(await prisma.reporte.count({ where: { usuarioId: vecino.id } })).toBe(0);
  });

  it('la reputación del vecino ya no cuenta para el nivel', async () => {
    const confiable = await crearUsuario({ rol: 'VECINO' });
    await prisma.usuario.update({ where: { id: confiable.id }, data: { reputacion: 100 } });

    const reporte = await reportar(confiable, { foto: await fotoUnica(jpegSinExif()) });

    expect(reporte).toMatchObject({ nivelConfianza: 33, estadoVerificacion: 'PENDIENTE_REVISION' });
  });

  it('el sistema nunca deja un reporte DESESTIMADO por sí solo, ni con todos los controles en contra', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    // EXIF lejos del punto, foto vieja y repetida.
    await reportar(vecino);
    const peor = await reportar(vecino, { lat: -38.99, registradoEn: '2026-11-15T18:00:00Z' });

    expect(peor.nivelConfianza).toBe(0);
    expect(peor.estadoVerificacion).toBe('PENDIENTE_REVISION');
  });
});
