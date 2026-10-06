import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearUsuario } from './apoyo.js';
import { jpegConExif } from './imagenes.js';

async function crearCategoria() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  return prisma.categoria.create({ data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id } });
}

async function vecino() {
  const usuario = await crearUsuario({ rol: 'VECINO' });
  return { usuario, token: crearTokenAcceso(usuario) };
}

/** Carga un reporte por la API, como lo haría la app. */
async function reportar(token: string, categoriaId: number, registradoEn: string) {
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${token}`)
    .field('categoriaId', String(categoriaId))
    .field('severidadDeclarada', 'MODERADA')
    .field('descripcion', `Reporte del ${registradoEn}`)
    .field('lat', '-38.95')
    .field('lon', '-68.06')
    .field('origen', 'APP_MOVIL')
    .field('registradoEn', registradoEn)
    .attach('foto', jpegConExif(), 'foto.jpg');
  return res.body as { id: number; incidenteId: number };
}

const misReportes = (token: string) =>
  request(app).get('/api/reportes/mios').set('Authorization', `Bearer ${token}`);

describe('GET /api/reportes/mios', () => {
  it('devuelve los reportes del vecino con categoría, foto y los dos estados, del más nuevo al más viejo', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();
    const viejo = await reportar(token, categoria.id, '2026-10-01T10:00:00-03:00');
    const nuevo = await reportar(token, categoria.id, '2026-10-03T10:00:00-03:00');

    const res = await misReportes(token);

    expect(res.status).toBe(200);
    expect(res.body.reportes.map((r: { id: number }) => r.id)).toEqual([nuevo.id, viejo.id]);
    const foto = await prisma.fotografia.findFirstOrThrow({ where: { reporteId: nuevo.id } });
    expect(res.body.reportes[0]).toEqual({
      id: nuevo.id,
      registradoEn: '2026-10-03T13:00:00.000Z',
      categoria: { id: categoria.id, nombre: categoria.nombre },
      severidadDeclarada: 'MODERADA',
      descripcion: 'Reporte del 2026-10-03T10:00:00-03:00',
      fotos: [{ id: foto.id, url: `/api/fotos/${foto.id}` }],
      estadoVerificacion: 'PENDIENTE_REVISION',
      incidente: { id: nuevo.incidenteId, estado: 'REGISTRADO', enRevision: true },
    });
  });

  it('solo devuelve los reportes del usuario autenticado', async () => {
    const categoria = await crearCategoria();
    const ana = await vecino();
    const bruno = await vecino();
    const deAna = await reportar(ana.token, categoria.id, '2026-10-02T10:00:00-03:00');
    await reportar(bruno.token, categoria.id, '2026-10-02T11:00:00-03:00');

    const res = await misReportes(ana.token);

    expect(res.body.reportes.map((r: { id: number }) => r.id)).toEqual([deAna.id]);
  });

  it('si su incidente se unió a otro, muestra el estado del principal', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();
    const otro = await vecino();
    const mio = await reportar(token, categoria.id, '2026-10-02T10:00:00-03:00');
    const delPrincipal = await reportar(otro.token, categoria.id, '2026-10-01T10:00:00-03:00');
    // Un operador unió mi incidente al del otro vecino, que ya está en ejecución.
    await prisma.incidente.update({
      where: { id: delPrincipal.incidenteId },
      data: { estado: 'EN_EJECUCION' },
    });
    await prisma.incidente.update({
      where: { id: mio.incidenteId },
      data: { incidentePrincipalId: delPrincipal.incidenteId },
    });

    const res = await misReportes(token);

    expect(res.body.reportes[0].incidente).toEqual({
      id: delPrincipal.incidenteId,
      estado: 'EN_EJECUCION',
      enRevision: false,
    });
  });

  it('sigue la cadena si el principal también se unió a otro', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();
    const otro = await vecino();
    const mio = await reportar(token, categoria.id, '2026-10-02T10:00:00-03:00');
    const intermedio = await reportar(otro.token, categoria.id, '2026-10-01T10:00:00-03:00');
    const final = await reportar(otro.token, categoria.id, '2026-09-30T10:00:00-03:00');
    await prisma.incidente.update({ where: { id: final.incidenteId }, data: { estado: 'RESUELTO' } });
    await prisma.incidente.update({
      where: { id: intermedio.incidenteId },
      data: { incidentePrincipalId: final.incidenteId },
    });
    await prisma.incidente.update({
      where: { id: mio.incidenteId },
      data: { incidentePrincipalId: intermedio.incidenteId },
    });

    const res = await misReportes(token);

    expect(res.body.reportes[0].incidente).toMatchObject({ id: final.incidenteId, estado: 'RESUELTO' });
  });

  it('un vecino sin reportes recibe la lista vacía', async () => {
    const { token } = await vecino();

    const res = await misReportes(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reportes: [] });
  });

  it('sin sesión responde 401', async () => {
    const res = await request(app).get('/api/reportes/mios');

    expect(res.status).toBe(401);
  });
});
