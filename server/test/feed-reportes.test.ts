import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn } from './apoyo.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

// Cada test con su propia categoría: el feed filtrado por ella solo trae lo del test.
let categoriaId: number;
let area: string;
beforeEach(async () => {
  const creado = await crearOrganismoDePrueba();
  categoriaId = creado.categoria.id;
  area = creado.area.nombre;
});

async function reportar(punto: { lat: number; lon: number }, pendiente = false) {
  const reporte = await reportarEn(punto, { categoriaId, pendiente });
  vecinos.push(reporte.vecinoId);
  return reporte;
}

const puntoNuevo = () => ({ lat: -38.9 - Math.random() * 0.05, lon: -68.0 - Math.random() * 0.05 });

const feed = (consulta: string, token?: string) => {
  const pedido = request(app).get(`/api/social/feed?categoriaId=${categoriaId}${consulta}`);
  return token ? pedido.set('Authorization', `Bearer ${token}`) : pedido;
};

describe('GET /api/social/feed', () => {
  it('cada reporte publicado es una publicación, del más nuevo al más viejo, con la línea a su incidente', async () => {
    const punto = puntoNuevo();
    const primero = await reportar(punto);
    const segundo = await reportar(punto);
    // Otro problema, en otro lado.
    const otro = await reportar(puntoNuevo());

    const res = await feed('');

    expect(res.status).toBe(200);
    expect(res.body.reportes.map((r: { id: number }) => r.id)).toEqual([otro.id, segundo.id, primero.id]);
    // Los dos del mismo problema dicen que lo reportaron dos vecinos, cada uno con su número.
    expect(res.body.reportes[1]).toMatchObject({
      id: segundo.id,
      incidenteId: primero.incidenteId,
      autor: { numero: 2, nombre: 'Vecino 2', sistema: false },
      categoria: { id: categoriaId },
      severidad: 'MODERADA',
      derivadoA: { nombre: area },
      fotos: [expect.objectContaining({ url: expect.stringMatching(/^\/api\/fotos\/\d+$/) })],
      // El de SnapIt al publicarlo.
      cantidadComentarios: 1,
      cantidadMeGusta: 0,
      yaMeGusta: false,
      incidente: { id: primero.incidenteId, estado: 'VERIFICADO', resueltoEn: null, cantidadVecinos: 2 },
    });
    expect(res.body.reportes[2].autor.numero).toBe(1);
    expect(res.body.siguiente).toBeNull();
  });

  it('no trae los pendientes, los desestimados ni los eliminados', async () => {
    const punto = puntoNuevo();
    const publicado = await reportar(punto);
    await reportar(punto, true);
    const desestimado = await reportar(punto);
    await prisma.reporte.update({
      where: { id: desestimado.id },
      data: { estadoVerificacion: 'DESESTIMADO' },
    });
    const eliminado = await reportar(punto);
    await prisma.reporte.update({ where: { id: eliminado.id }, data: { eliminadoEn: new Date() } });

    const res = await feed('');

    expect(res.body.reportes.map((r: { id: number }) => r.id)).toEqual([publicado.id]);
  });

  it('pagina con el cursor, y con sesión dice si ya le diste me gusta', async () => {
    const reportes = [];
    for (let i = 0; i < 3; i++) reportes.push(await reportar(puntoNuevo()));
    const vecino = await crearUsuario();
    await prisma.meGustaReporte.create({ data: { reporteId: reportes[0]!.id, usuarioId: vecino.id } });
    const token = crearTokenAcceso(vecino);

    const primera = await feed('&limite=2', token);
    const segunda = await feed(`&limite=2&cursor=${primera.body.siguiente}`, token);

    expect(primera.body.reportes.map((r: { id: number }) => r.id)).toEqual([
      reportes[2]!.id,
      reportes[1]!.id,
    ]);
    expect(primera.body.siguiente).toEqual(expect.any(String));
    expect(segunda.body.reportes).toEqual([
      expect.objectContaining({ id: reportes[0]!.id, yaMeGusta: true, cantidadMeGusta: 1 }),
    ]);
    expect(segunda.body.siguiente).toBeNull();
  });
});
