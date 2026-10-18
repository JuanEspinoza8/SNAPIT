import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { env } from '../src/config/env.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { jpegConExif } from './imagenes.js';

// La dirección se prueba en direcciones.test.ts: acá no se consulta Nominatim.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

async function crearOrganismo() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  return { organismoId: organismo.id, areaId: area.id };
}

const vecinos: number[] = [];

async function tokenDeVecino() {
  const usuario = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(usuario.id);
  return crearTokenAcceso(usuario);
}

afterAll(() => borrarReportesDe(vecinos));

/**
 * Carga un reporte por la API, en una categoría del organismo indicado (o de uno nuevo). Devuelve
 * el id de su foto, el del reporte, el de su incidente y el token de su dueño.
 */
async function reporteConFoto(organismo?: { areaId: number }) {
  const { areaId } = organismo ?? (await crearOrganismo());
  const categoria = await prisma.categoria.create({ data: { nombre: `Categoría ${randomUUID()}`, areaId } });
  const duenio = await tokenDeVecino();
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${duenio}`)
    .field('categoriaId', String(categoria.id))
    .field('severidadDeclarada', 'MODERADA')
    .field('lat', '-38.95')
    .field('lon', '-68.06')
    .field('origen', 'APP_MOVIL')
    .attach('foto', jpegConExif(), 'foto.jpg');
  const foto = await prisma.fotografia.findFirstOrThrow({ where: { reporteId: res.body.id } });
  return {
    fotoId: foto.id,
    reporteId: res.body.id as number,
    incidenteId: res.body.incidenteId as number,
    duenio,
  };
}

async function tokenDeGestion(
  rol: 'OPERADOR' | 'ADMINISTRADOR',
  organismo: { organismoId: number; areaId: number } | null,
) {
  const usuario = await crearUsuario({
    rol,
    organismoId: organismo?.organismoId ?? null,
    // Solo los operadores tienen área.
    areaId: rol === 'OPERADOR' ? (organismo?.areaId ?? null) : null,
  });
  return crearTokenAcceso(usuario);
}

const desestimar = (reporteId: number) =>
  prisma.reporte.update({ where: { id: reporteId }, data: { estadoVerificacion: 'DESESTIMADO' } });

function bajar(fotoId: number, token?: string) {
  const peticion = request(app).get(`/api/fotos/${fotoId}`);
  return token ? peticion.set('Authorization', `Bearer ${token}`) : peticion;
}

describe('GET /api/fotos/:id sin sesión', () => {
  it('una foto que no existe responde 404', async () => {
    const res = await bajar(999999999);

    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('FOTO_NO_ENCONTRADA');
  });

  it('un id que no entra en la base responde 400', async () => {
    const res = await bajar(99_999_999_999);

    expect(res.status).toBe(400);
  });

  it('sirve la foto de un incidente del mapa, con caché pública de una hora', async () => {
    const { fotoId } = await reporteConFoto();

    const res = await bajar(fotoId);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.headers.vary).toContain('Authorization');
  });

  it('la foto de un reporte desestimado no se sirve, aunque su incidente siga en el mapa', async () => {
    const { fotoId, reporteId } = await reporteConFoto();
    expect((await bajar(fotoId)).status).toBe(200);

    await desestimar(reporteId);

    const res = await bajar(fotoId);
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('FOTO_NO_ENCONTRADA');
  });

  it('la foto de un incidente que no está en el mapa no se sirve', async () => {
    const desestimado = await reporteConFoto();
    const caducado = await reporteConFoto();
    await prisma.incidente.update({
      where: { id: desestimado.incidenteId },
      data: { estado: 'DESESTIMADO' },
    });
    await prisma.incidente.update({ where: { id: caducado.incidenteId }, data: { caducadoEn: new Date() } });

    expect((await bajar(desestimado.fotoId)).status).toBe(404);
    expect((await bajar(caducado.fotoId)).status).toBe(404);
  });

  it('la foto de un incidente unido se sirve mientras el principal esté en el mapa', async () => {
    const unido = await reporteConFoto();
    const principal = await reporteConFoto();
    await prisma.incidente.update({
      where: { id: unido.incidenteId },
      data: { incidentePrincipalId: principal.incidenteId },
    });
    expect((await bajar(unido.fotoId)).status).toBe(200);

    await prisma.incidente.update({ where: { id: principal.incidenteId }, data: { estado: 'DESESTIMADO' } });

    expect((await bajar(unido.fotoId)).status).toBe(404);
  });
});

describe('GET /api/fotos/:id para el dueño del reporte', () => {
  it('ve la foto de su reporte desestimado, con caché privada', async () => {
    const { fotoId, reporteId, duenio } = await reporteConFoto();
    await desestimar(reporteId);

    const res = await bajar(fotoId, duenio);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
  });

  it('ve la foto aunque su incidente esté desestimado o caducado', async () => {
    const desestimado = await reporteConFoto();
    const caducado = await reporteConFoto();
    await prisma.incidente.update({
      where: { id: desestimado.incidenteId },
      data: { estado: 'DESESTIMADO' },
    });
    await prisma.incidente.update({ where: { id: caducado.incidenteId }, data: { caducadoEn: new Date() } });

    expect((await bajar(desestimado.fotoId, desestimado.duenio)).status).toBe(200);
    expect((await bajar(caducado.fotoId, caducado.duenio)).status).toBe(200);
  });

  it('ve la foto de un reporte que quedó sin incidente', async () => {
    const { fotoId, incidenteId, duenio } = await reporteConFoto();
    // Al borrar el incidente, la base deja el reporte con incidente_id en null.
    await prisma.incidente.delete({ where: { id: incidenteId } });

    expect((await bajar(fotoId, duenio)).status).toBe(200);
    expect((await bajar(fotoId)).status).toBe(404);
  });

  it('otro vecino recibe 404 por esa misma foto, igual que alguien sin sesión', async () => {
    const { fotoId, reporteId } = await reporteConFoto();
    await desestimar(reporteId);

    const otroVecino = await bajar(fotoId, await tokenDeVecino());
    const sinSesion = await bajar(fotoId);

    expect(otroVecino.status).toBe(404);
    expect(otroVecino.body.error.codigo).toBe('FOTO_NO_ENCONTRADA');
    expect(sinSesion.status).toBe(404);
  });
});

describe('GET /api/fotos/:id para operadores y administradores', () => {
  it('un operador ve la foto de un reporte desestimado de su organismo; uno de otro organismo recibe 404', async () => {
    const organismo = await crearOrganismo();
    const { fotoId, reporteId } = await reporteConFoto(organismo);
    await desestimar(reporteId);

    const delOrganismo = await bajar(fotoId, await tokenDeGestion('OPERADOR', organismo));
    const deOtro = await bajar(fotoId, await tokenDeGestion('OPERADOR', await crearOrganismo()));

    expect(delOrganismo.status).toBe(200);
    expect(delOrganismo.headers['cache-control']).toBe('private, max-age=3600');
    expect(deOtro.status).toBe(404);
    expect(deOtro.body.error.codigo).toBe('FOTO_NO_ENCONTRADA');
  });

  it('un operador ve las fotos de un incidente caducado de su organismo', async () => {
    const organismo = await crearOrganismo();
    const { fotoId, incidenteId } = await reporteConFoto(organismo);
    await prisma.incidente.update({ where: { id: incidenteId }, data: { caducadoEn: new Date() } });

    expect((await bajar(fotoId, await tokenDeGestion('OPERADOR', organismo))).status).toBe(200);
  });

  it('si el incidente se derivó, manda el organismo del área a la que se derivó y no el de la categoría', async () => {
    const deLaCategoria = await crearOrganismo();
    const derivado = await crearOrganismo();
    const { fotoId, reporteId, incidenteId } = await reporteConFoto(deLaCategoria);
    await desestimar(reporteId);
    await prisma.incidente.update({ where: { id: incidenteId }, data: { areaId: derivado.areaId } });

    expect((await bajar(fotoId, await tokenDeGestion('OPERADOR', derivado))).status).toBe(200);
    expect((await bajar(fotoId, await tokenDeGestion('OPERADOR', deLaCategoria))).status).toBe(404);
  });

  it('si el incidente se unió a otro, manda el organismo del principal', async () => {
    const delUnido = await crearOrganismo();
    const delPrincipal = await crearOrganismo();
    const unido = await reporteConFoto(delUnido);
    const principal = await reporteConFoto(delPrincipal);
    await desestimar(unido.reporteId);
    await prisma.incidente.update({
      where: { id: unido.incidenteId },
      data: { incidentePrincipalId: principal.incidenteId },
    });

    expect((await bajar(unido.fotoId, await tokenDeGestion('OPERADOR', delPrincipal))).status).toBe(200);
    expect((await bajar(unido.fotoId, await tokenDeGestion('OPERADOR', delUnido))).status).toBe(404);
  });

  it('un administrador del organismo ve la foto; uno sin organismo recibe 404', async () => {
    const organismo = await crearOrganismo();
    const { fotoId, reporteId } = await reporteConFoto(organismo);
    await desestimar(reporteId);

    expect((await bajar(fotoId, await tokenDeGestion('ADMINISTRADOR', organismo))).status).toBe(200);
    expect((await bajar(fotoId, await tokenDeGestion('ADMINISTRADOR', null))).status).toBe(404);
  });
});

describe('GET /api/fotos/:id con token', () => {
  it('una foto del mapa se sirve igual con la sesión de cualquiera', async () => {
    const { fotoId } = await reporteConFoto();

    expect((await bajar(fotoId, await tokenDeVecino())).status).toBe(200);
    expect((await bajar(fotoId, await tokenDeGestion('OPERADOR', await crearOrganismo()))).status).toBe(200);
  });

  it('con un token vencido responde 401 TOKEN_VENCIDO, aunque la foto sea del mapa, para que el cliente renueve', async () => {
    const { fotoId } = await reporteConFoto();
    const usuario = await crearUsuario();
    const vencido = jwt.sign({ rol: 'VECINO', iat: Math.floor(Date.now() / 1000) - 3600 }, env.JWT_SECRET, {
      subject: String(usuario.id),
      expiresIn: '15m',
    });

    const res = await bajar(fotoId, vencido);

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('TOKEN_VENCIDO');
  });

  it('con un token adulterado responde 401 TOKEN_INVALIDO', async () => {
    const { fotoId } = await reporteConFoto();

    const res = await bajar(fotoId, 'no-es-un-token');

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('TOKEN_INVALIDO');
  });
});
