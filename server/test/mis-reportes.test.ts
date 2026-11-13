import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearUsuario, tokenDe } from './apoyo.js';
import { jpegConExif } from './imagenes.js';

// La dirección se prueba en direcciones.test.ts: acá no se consulta Nominatim.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

async function crearCategoria() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  return prisma.categoria.create({ data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id } });
}

const vecinos: number[] = [];

async function vecino() {
  const usuario = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(usuario.id);
  return { usuario, token: crearTokenAcceso(usuario) };
}

afterAll(() => borrarReportesDe(vecinos));

type Reportado = { id: number; incidenteId: number };

/** Carga un reporte por la API, como lo haría la app. */
// Reportes en el mismo punto y de la misma categoría se agrupan solos (#53): para tener incidentes
// distintos, cada reporte va en un lugar distinto.
async function reportar(token: string, categoriaId: number, registradoEn: string, lat = '-38.95') {
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${token}`)
    .field('categoriaId', String(categoriaId))
    .field('severidadDeclarada', 'MODERADA')
    .field('descripcion', `Reporte del ${registradoEn}`)
    .field('lat', lat)
    .field('lon', '-68.06')
    .field('origen', 'APP_MOVIL')
    .field('registradoEn', registradoEn)
    .attach('foto', jpegConExif(), 'foto.jpg');
  return res.body as Reportado;
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
      incidente: { id: nuevo.incidenteId, estado: 'REGISTRADO', enRevision: true, caducadoEn: null },
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

  it('si su incidente se unió a otro, muestra el estado y la caducidad del principal', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();
    const otro = await vecino();
    const mio = await reportar(token, categoria.id, '2026-10-02T10:00:00-03:00');
    // A un kilómetro: la agrupación automática no los junta, el operador los une a mano.
    const delPrincipal = await reportar(otro.token, categoria.id, '2026-10-01T10:00:00-03:00', '-38.96');
    // Un operador unió mi incidente al del otro vecino, que ya está en ejecución y después caducó.
    const caduco = new Date(Date.now() - 60_000);
    await prisma.incidente.update({
      where: { id: delPrincipal.incidenteId },
      data: { estado: 'EN_EJECUCION', tipoVigencia: 'TEMPORAL', vigenteHasta: caduco, caducadoEn: caduco },
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
      caducadoEn: caduco.toISOString(),
    });
  });

  it('dice cuándo caducó o venció su incidente, y nada si se resolvió antes', async () => {
    const { token } = await vecino();
    // Una categoría por reporte: así no se agrupan, aunque estén en el mismo punto.
    const reportarEl = async (dia: string) =>
      reportar(token, (await crearCategoria()).id, `2026-10-${dia}T10:00:00-03:00`);
    const vigente = await reportarEl('01');
    const vencido = await reportarEl('02');
    const caducado = await reportarEl('03');
    const resuelto = await reportarEl('04');
    const enUnDia = new Date(Date.now() + 86_400_000);
    const haceUnaHora = new Date(Date.now() - 3_600_000);
    const haceDosHoras = new Date(Date.now() - 7_200_000);
    const vigencias = [
      [vigente, { tipoVigencia: 'TEMPORAL', vigenteHasta: enUnDia }],
      // Vencido, pero la tarea diaria todavía no lo marcó.
      [vencido, { tipoVigencia: 'TEMPORAL', vigenteHasta: haceUnaHora }],
      [caducado, { tipoVigencia: 'TEMPORAL', vigenteHasta: haceDosHoras, caducadoEn: haceDosHoras }],
      [resuelto, { estado: 'RESUELTO', tipoVigencia: 'TEMPORAL', vigenteHasta: haceUnaHora }],
    ] as const;
    for (const [reporte, data] of vigencias) {
      await prisma.incidente.update({ where: { id: reporte.incidenteId }, data });
    }

    const res = await misReportes(token);

    const caducadoEn = Object.fromEntries(
      res.body.reportes.map((r: { id: number; incidente: { caducadoEn: string | null } }) => [
        r.id,
        r.incidente.caducadoEn,
      ]),
    );
    expect(caducadoEn).toEqual({
      [vigente.id]: null,
      [vencido.id]: haceUnaHora.toISOString(),
      [caducado.id]: haceDosHoras.toISOString(),
      [resuelto.id]: null,
    });
  });

  it('un vecino sin reportes recibe la lista vacía', async () => {
    const { token } = await vecino();

    const res = await misReportes(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reportes: [] });
  });

  it('sin sesión responde 401 y con otro rol, 403', async () => {
    const sinSesion = await request(app).get('/api/reportes/mios');
    const operador = await misReportes(await tokenDe('OPERADOR'));

    expect(sinSesion.status).toBe(401);
    expect(operador.status).toBe(403);
    expect(operador.body.error.codigo).toBe('SIN_PERMISO');
  });
});
