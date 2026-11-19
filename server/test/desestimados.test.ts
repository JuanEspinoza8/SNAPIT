import { randomUUID } from 'node:crypto';
import type { Area, Categoria, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn, tokenDe } from './apoyo.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;
let punto: { lat: number; lon: number };

beforeEach(async () => {
  let organismo;
  ({ organismo, area, categoria } = await crearOrganismoDePrueba());
  operador = await crearUsuario({ rol: 'OPERADOR', organismoId: organismo.id, areaId: area.id });
  token = crearTokenAcceso(operador);
  // Un punto al azar, lejos del resto de los tests: los reportes de un mismo test caen en el mismo incidente.
  punto = { lat: -38.75 - Math.random() * 0.05, lon: -68.25 - Math.random() * 0.05 };
});

async function reportar(opciones: { pendiente: boolean }) {
  const reporte = await reportarEn(punto, { categoriaId: categoria.id, ...opciones });
  vecinos.push(reporte.vecinoId);
  return reporte;
}

/** Deja el reporte como lo deja la IA cuando su foto no muestra un problema de la vía pública (ia/cola.ts). */
async function marcar(reporteId: number) {
  const registro = await prisma.registroIa.create({
    data: {
      tipo: 'CLASIFICACION_IMAGEN',
      proveedor: 'ANTHROPIC',
      modelo: 'claude-haiku-5-5',
      usuarioId: operador.id,
      salida: {
        esProblemaViaPublica: false,
        categoriaId: null,
        severidad: null,
        mismoProblema: null,
        datosPersonales: false,
        explicacion: 'Es un perro en un patio.',
      },
      duracionMs: 2000,
    },
  });
  const paso = { procesoId: randomUUID(), organismoId: area.organismoId, usuarioId: operador.id, reporteId };
  await prisma.eventoVerificacionIa.createMany({
    data: [
      {
        ...paso,
        estado: 'CLASIFICADO',
        detalle: 'La IA no ve un problema de la vía pública.',
        registroIaId: registro.id,
      },
      {
        ...paso,
        estado: 'REVISION_MANUAL',
        detalle: 'Queda en los desestimados pendientes',
        registroIaId: registro.id,
      },
    ],
  });
}

const get = (ruta: string, conToken = token) =>
  request(app).get(ruta).set('Authorization', `Bearer ${conToken}`);
const confirmar = (cuerpo: object = {}, conToken = token) =>
  request(app)
    .post('/api/reportes/desestimados-pendientes/confirmacion')
    .set('Authorization', `Bearer ${conToken}`)
    .send(cuerpo);
const ids = (res: request.Response) => res.body.reportes.map((r: { id: number }) => r.id);

describe('GET /api/reportes/desestimados-pendientes', () => {
  it('trae los marcados para desestimar, que salen de los pendientes comunes', async () => {
    const marcado = await reportar({ pendiente: true });
    await marcar(marcado.id);
    const comun = await reportar({ pendiente: true });

    const desestimados = await get('/api/reportes/desestimados-pendientes');
    const pendientes = await get('/api/reportes/pendientes');
    const todos = await get('/api/reportes');

    expect(desestimados.status).toBe(200);
    expect(ids(desestimados)).toEqual([marcado.id]);
    expect(desestimados.body.reportes[0].propuestaIa).toMatchObject({
      explicacion: 'Es un perro en un patio.',
    });
    expect(ids(pendientes)).toContain(comun.id);
    expect(ids(pendientes)).not.toContain(marcado.id);
    expect(todos.body.reportes.find((r: { id: number }) => r.id === marcado.id)).toMatchObject({
      estadoVerificacion: 'PENDIENTE_REVISION',
      marcadoParaDesestimar: true,
    });
  });

  it('un vecino no puede verlos', async () => {
    const res = await get('/api/reportes/desestimados-pendientes', await tokenDe('VECINO'));

    expect(res.status).toBe(403);
  });
});

describe('mientras esperan, no se ven en público', () => {
  it('un incidente cuyo único reporte está marcado no está en el mapa, ni en el feed, ni su foto', async () => {
    const marcado = await reportar({ pendiente: true });
    await marcar(marcado.id);
    const { fotografias } = await prisma.reporte.findUniqueOrThrow({
      where: { id: marcado.id },
      include: { fotografias: true },
    });

    const ficha = await request(app).get(`/api/incidentes/${marcado.incidenteId}`);
    const feed = await request(app).get(`/api/incidentes/feed?categoriaId=${categoria.id}`);
    const foto = await request(app).get(`/api/fotos/${fotografias[0]!.id}`);
    const delDuenio = await request(app)
      .get(`/api/fotos/${fotografias[0]!.id}`)
      .set(
        'Authorization',
        `Bearer ${crearTokenAcceso({ id: marcado.vecinoId, rol: 'VECINO', organismoId: null, areaId: null })}`,
      );

    expect(ficha.status).toBe(404);
    expect(feed.body.incidentes).toEqual([]);
    expect(foto.status).toBe(404);
    // Su autor la sigue viendo.
    expect(delDuenio.status).toBe(200);
  });

  it('si el incidente tiene otro reporte que se ve, se muestra, pero sin la foto del marcado', async () => {
    const verificado = await reportar({ pendiente: false });
    const marcado = await reportar({ pendiente: true });
    expect(marcado.incidenteId).toBe(verificado.incidenteId);
    await marcar(marcado.id);

    const ficha = await request(app).get(`/api/incidentes/${verificado.incidenteId}`);
    const social = await request(app).get(`/api/social/incidentes/${verificado.incidenteId}/reportes`);

    expect(ficha.status).toBe(200);
    expect(ficha.body.fotos).toHaveLength(1);
    expect(ficha.body.cantidadVecinos).toBe(1);
    expect(social.body.reportes.map((r: { id: number }) => r.id)).toEqual([verificado.id]);
    expect((await request(app).get(`/api/social/reportes/${marcado.id}`)).status).toBe(404);
  });
});

describe('POST /api/reportes/desestimados-pendientes/confirmacion', () => {
  it('sin ids, desestima todos los del organismo como una revisión', async () => {
    const primero = await reportar({ pendiente: true });
    await marcar(primero.id);

    const res = await confirmar();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ desestimados: [primero.id], omitidos: [] });
    const guardado = await prisma.reporte.findUniqueOrThrow({
      where: { id: primero.id },
      include: { incidente: true, usuario: true },
    });
    expect(guardado.estadoVerificacion).toBe('DESESTIMADO');
    // Era su único reporte: el incidente queda desestimado.
    expect(guardado.incidente!.estado).toBe('DESESTIMADO');
    expect(guardado.usuario.reportesDesestimados).toBe(1);
    const [movimiento] = await prisma.movimientoIncidente.findMany({
      where: { incidenteId: primero.incidenteId },
    });
    expect(movimiento!.comentario).toContain(
      'la IA marcó que la foto no muestra un problema de la vía pública',
    );
    expect(ids(await get('/api/reportes/desestimados-pendientes'))).toEqual([]);
  });

  it('con ids, desestima esos y omite los que no están marcados o son de otro organismo', async () => {
    const marcado = await reportar({ pendiente: true });
    await marcar(marcado.id);
    const comun = await reportar({ pendiente: true });
    const otroOrganismo = await crearOrganismoDePrueba();
    const ajeno = await reportarEn(
      { lat: punto.lat + 0.01, lon: punto.lon },
      { categoriaId: otroOrganismo.categoria.id, pendiente: true },
    );
    vecinos.push(ajeno.vecinoId);

    const res = await confirmar({ ids: [marcado.id, comun.id, ajeno.id, 999_999_999] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      desestimados: [marcado.id],
      omitidos: [
        { id: comun.id, motivo: 'Ya no está marcado para desestimar' },
        { id: ajeno.id, motivo: 'El reporte es de un incidente de otro organismo' },
        { id: 999_999_999, motivo: 'El reporte no existe' },
      ],
    });
    expect((await prisma.reporte.findUniqueOrThrow({ where: { id: comun.id } })).estadoVerificacion).toBe(
      'PENDIENTE_REVISION',
    );
  });

  it('valida los ids', async () => {
    const res = await confirmar({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('rescatar un marcado', () => {
  it('al verificarlo vuelve a verse, con el agradecimiento de SnapIt', async () => {
    const marcado = await reportar({ pendiente: true });
    await marcar(marcado.id);

    const res = await request(app)
      .post(`/api/reportes/${marcado.id}/revision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFICADO' });

    expect(res.status).toBe(200);
    expect(ids(await get('/api/reportes/desestimados-pendientes'))).toEqual([]);
    const ficha = await request(app).get(`/api/incidentes/${marcado.incidenteId}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.fotos).toHaveLength(1);
    const comentarios = await request(app).get(`/api/social/reportes/${marcado.id}/comentarios`);
    expect(comentarios.body.comentarios).toEqual([
      expect.objectContaining({
        texto: `¡Gracias por tu reporte! Ya fue derivado al área de ${area.nombre}.`,
      }),
    ]);
  });
});
