import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { idUsuarioSistema, USUARIO_SISTEMA } from '../src/compartido/usuarioSistema.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn } from './apoyo.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

/** Un reporte pendiente en un organismo nuevo, con un operador de ese organismo para revisarlo. */
async function pendienteConOperador() {
  const { organismo, area, categoria } = await crearOrganismoDePrueba();
  const operador = await crearUsuario({ rol: 'OPERADOR', organismoId: organismo.id, areaId: area.id });
  // Un punto al azar, lejos del resto de los tests, para que no se agrupe con otro reporte.
  const punto = { lat: -38.8 - Math.random() * 0.05, lon: -68.2 - Math.random() * 0.05 };
  const reporte = await reportarEn(punto, { categoriaId: categoria.id, pendiente: true });
  vecinos.push(reporte.vecinoId);
  return { area, reporte, token: crearTokenAcceso(operador) };
}

const revisar = (id: number, decision: string, token: string) =>
  request(app)
    .post(`/api/reportes/${id}/revision`)
    .set('Authorization', `Bearer ${token}`)
    .send({ decision });

const comentariosDe = (reporteId: number) =>
  prisma.comentario.findMany({ where: { reporteId }, orderBy: { id: 'asc' } });

describe('agradecimiento de SnapIt al publicar un reporte', () => {
  it('al verificarlo, SnapIt le comenta al vecino a qué área se derivó', async () => {
    const { area, reporte, token } = await pendienteConOperador();

    const res = await revisar(reporte.id, 'VERIFICADO', token);

    expect(res.status).toBe(200);
    expect(await comentariosDe(reporte.id)).toEqual([
      expect.objectContaining({
        usuarioId: await idUsuarioSistema(),
        texto: `¡Gracias por tu reporte! Ya fue derivado al área de ${area.nombre}.`,
      }),
    ]);
  });

  it('al desestimarlo, no comenta nada', async () => {
    const { reporte, token } = await pendienteConOperador();

    await revisar(reporte.id, 'DESESTIMADO', token);

    expect(await comentariosDe(reporte.id)).toEqual([]);
  });

  it('en público, el comentario figura a nombre de SnapIt y no le quita el número a ningún vecino', async () => {
    const { reporte, token } = await pendienteConOperador();
    await revisar(reporte.id, 'VERIFICADO', token);
    const vecino = await crearUsuario();
    vecinos.push(vecino.id);
    // Un minuto después: el comentario toma la hora de Node y el reporte la de la base, y unos milisegundos de
    // diferencia entre los dos relojes podían ponerlo antes del reporte y cambiar los números.
    await prisma.comentario.create({
      data: {
        usuarioId: vecino.id,
        reporteId: reporte.id,
        texto: 'Confirmo',
        creadoEn: new Date(Date.now() + 60_000),
      },
    });

    const res = await request(app).get(`/api/social/reportes/${reporte.id}/comentarios`);
    const publico = await request(app).get(`/api/social/reportes/${reporte.id}`);

    expect(res.status).toBe(200);
    expect(res.body.comentarios.map((c: { autor: object }) => c.autor)).toEqual([
      { numero: null, nombre: USUARIO_SISTEMA.nombre, sistema: true },
      // El autor del reporte es el vecino 1; el que comentó después, el 2.
      { numero: 2, nombre: 'Vecino 2', sistema: false },
    ]);
    expect(publico.body.autor).toEqual({ numero: 1, nombre: 'Vecino 1', sistema: false });
    expect(publico.body.cantidadComentarios).toBe(2);
  });

  it('con nadie iniciando sesión como SnapIt: su clave no es ninguna conocida', async () => {
    const res = await request(app)
      .post('/api/auth/ingreso')
      .send({ email: USUARIO_SISTEMA.email, clave: 'clave-de-prueba-1' });

    expect(res.status).toBe(401);
  });
});

describe('derivadoA en la ficha pública', () => {
  it('es null mientras el incidente está en revisión y el área de su categoría cuando se publica', async () => {
    const { area, reporte, token } = await pendienteConOperador();

    const enRevision = await request(app).get(`/api/incidentes/${reporte.incidenteId}`);
    await revisar(reporte.id, 'VERIFICADO', token);
    const publicado = await request(app).get(`/api/incidentes/${reporte.incidenteId}`);

    expect(enRevision.body).toMatchObject({ enRevision: true, derivadoA: null });
    expect(publicado.body).toMatchObject({
      enRevision: false,
      derivadoA: { id: area.id, nombre: area.nombre },
    });
  });

  it('si el operador lo derivó a otra área, muestra esa', async () => {
    const { area, reporte, token } = await pendienteConOperador();
    await revisar(reporte.id, 'VERIFICADO', token);
    const otra = await prisma.area.create({ data: { organismoId: area.organismoId, nombre: 'Otra área' } });
    await prisma.incidente.update({ where: { id: reporte.incidenteId }, data: { areaId: otra.id } });

    const res = await request(app).get(`/api/incidentes/${reporte.incidenteId}`);

    expect(res.body.derivadoA).toEqual({ id: otra.id, nombre: 'Otra área' });
  });
});
