import { randomUUID } from 'node:crypto';
import type { Area, Categoria, Severidad, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { alCambiarIncidente } from '../src/modulos/incidentes/eventos.js';
import { calcularReputacion } from '../src/modulos/verificacion/calculo.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { EXIF_DE_PRUEBA, fotoUnica, jpegConExif, jpegSinExif } from './imagenes.js';

// La dirección no se consulta: no hace falta para la revisión.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

async function crearVecino() {
  const vecino = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(vecino.id);
  return vecino;
}

/** Un organismo con un área y una categoría propias, para que los tests no se crucen. */
async function crearOrganismo() {
  const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  return { area, categoria };
}

async function crearOperador(area: Area) {
  const usuario = await crearUsuario({ rol: 'OPERADOR' });
  const operador = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { organismoId: area.organismoId, areaId: area.id },
  });
  return { operador, token: crearTokenAcceso(operador) };
}

let area: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;

beforeEach(async () => {
  ({ area, categoria } = await crearOrganismo());
  ({ operador, token } = await crearOperador(area));
});

/**
 * Manda un reporte en el punto del EXIF de la foto de prueba. Con la cámara de la app y GPS queda verificado
 * (50 + 20 + 15, menos 20 si la foto ya es antigua); con una foto de galería sin EXIF, pendiente (50 − 10).
 */
async function reportar(vecino: Usuario, opciones: { verificado: boolean; severidad?: Severidad }) {
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(categoria.id))
    .field('severidadDeclarada', opciones.severidad ?? 'MODERADA')
    .field('lat', String(EXIF_DE_PRUEBA.latitud))
    .field('lon', String(EXIF_DE_PRUEBA.longitud))
    .field('origen', 'APP_MOVIL')
    .field('tomadaConCamaraApp', String(opciones.verificado))
    .attach('foto', await fotoUnica(opciones.verificado ? jpegConExif() : jpegSinExif()), 'foto.jpg');
  expect(res.status).toBe(201);
  expect(res.body.estadoVerificacion).toBe(opciones.verificado ? 'VERIFICADO' : 'PENDIENTE_REVISION');
  return res.body as { id: number; incidenteId: number };
}

const revisar = (id: number, cuerpo: object, conToken = token) =>
  request(app).post(`/api/reportes/${id}/revision`).set('Authorization', `Bearer ${conToken}`).send(cuerpo);

const pendientes = (conToken = token) =>
  request(app).get('/api/reportes/pendientes').set('Authorization', `Bearer ${conToken}`);

const historial = (id: number) =>
  prisma.usuario.findUniqueOrThrow({
    where: { id },
    select: { reputacion: true, reportesConfirmados: true, reportesDesestimados: true },
  });

const movimientos = (incidenteId: number) =>
  prisma.movimientoIncidente.findMany({ where: { incidenteId }, orderBy: { id: 'asc' } });

describe('reputación', () => {
  it('arranca en 50 y sigue la fórmula 100 × (confirmados + 1) / (confirmados + desestimados + 2)', () => {
    expect(calcularReputacion(0, 0)).toBe(50);
    expect(calcularReputacion(1, 0)).toBe(66.67);
    expect(calcularReputacion(0, 1)).toBe(33.33);
    expect(calcularReputacion(3, 1)).toBe(66.67);
    expect(calcularReputacion(9, 0)).toBe(90.91);
    expect(calcularReputacion(0, 9)).toBe(9.09);
  });

  it('un vecino nuevo tiene reputación 50', async () => {
    const vecino = await crearVecino();

    expect(await historial(vecino.id)).toMatchObject({ reportesConfirmados: 0, reportesDesestimados: 0 });
    expect(Number((await historial(vecino.id)).reputacion)).toBe(50);
  });
});

describe('verificación automática al recibir el reporte', () => {
  it('un reporte verificado suma a la reputación y verifica el incidente', async () => {
    const vecino = await crearVecino();

    const reporte = await reportar(vecino, { verificado: true });

    const vecinoDespues = await historial(vecino.id);
    expect(vecinoDespues).toMatchObject({ reportesConfirmados: 1, reportesDesestimados: 0 });
    expect(Number(vecinoDespues.reputacion)).toBe(66.67);
    const incidente = await prisma.incidente.findUniqueOrThrow({ where: { id: reporte.incidenteId } });
    expect(incidente.estado).toBe('VERIFICADO');
    expect(await movimientos(reporte.incidenteId)).toEqual([
      expect.objectContaining({
        tipo: 'CAMBIO_ESTADO',
        usuarioId: null,
        estadoAnterior: 'REGISTRADO',
        estadoNuevo: 'VERIFICADO',
        comentario: expect.stringMatching(new RegExp(`^Reporte #${reporte.id} verificado automáticamente`)),
      }),
    ]);
  });

  it('un reporte pendiente no cambia la reputación ni el incidente', async () => {
    const vecino = await crearVecino();

    const reporte = await reportar(vecino, { verificado: false });

    expect(await historial(vecino.id)).toMatchObject({ reportesConfirmados: 0, reportesDesestimados: 0 });
    const incidente = await prisma.incidente.findUniqueOrThrow({ where: { id: reporte.incidenteId } });
    expect(incidente.estado).toBe('REGISTRADO');
    expect(await movimientos(reporte.incidenteId)).toEqual([]);
  });
});

describe('GET /api/reportes/pendientes', () => {
  it('lista los pendientes del organismo con señales, fotos e historial del vecino', async () => {
    const vecino = await crearVecino();
    const pendiente = await reportar(vecino, { verificado: false });

    const res = await pendientes();

    expect(res.status).toBe(200);
    const fila = res.body.reportes.find((r: { id: number }) => r.id === pendiente.id);
    expect(fila).toMatchObject({
      categoria: { id: categoria.id },
      severidadDeclarada: 'MODERADA',
      origen: 'APP_MOVIL',
      nivelConfianza: 40,
      incidente: { id: pendiente.incidenteId, estado: 'REGISTRADO', cantidadReportes: 1 },
      vecino: { reputacion: 50, reportesConfirmados: 0, reportesDesestimados: 0 },
    });
    expect(fila.senales).toContainEqual(expect.objectContaining({ tipo: 'EXIF_AUSENTE', valor: -10 }));
    expect(fila.fotos).toEqual([
      { id: expect.any(Number), url: expect.stringMatching(/^\/api\/fotos\/\d+$/) },
    ]);
    // El operador puede ver la foto aunque el incidente no esté en el mapa (#49).
    const foto = await request(app).get(fila.fotos[0].url).set('Authorization', `Bearer ${token}`);
    expect(foto.status).toBe(200);
  });

  it('no incluye los verificados ni los de otros organismos', async () => {
    const vecino = await crearVecino();
    const verificado = await reportar(vecino, { verificado: true });
    const pendiente = await reportar(await crearVecino(), { verificado: false });
    const otro = await crearOperador((await crearOrganismo()).area);

    const delOrganismo = (await pendientes()).body.reportes.map((r: { id: number }) => r.id);
    const deOtro = (await pendientes(otro.token)).body.reportes.map((r: { id: number }) => r.id);

    expect(delOrganismo).toContain(pendiente.id);
    expect(delOrganismo).not.toContain(verificado.id);
    expect(deOtro).not.toContain(pendiente.id);
  });

  it('un vecino no puede verla', async () => {
    const res = await pendientes(crearTokenAcceso(await crearVecino()));

    expect(res.status).toBe(403);
  });
});

describe('POST /api/reportes/:id/revision', () => {
  it('verificar un pendiente suma a la reputación, verifica el incidente y lo deja en la bitácora', async () => {
    const vecino = await crearVecino();
    const reporte = await reportar(vecino, { verificado: false });
    const recalcular = vi.fn(async () => {});
    const darDeBaja = alCambiarIncidente(recalcular);

    const res = await revisar(reporte.id, { decision: 'VERIFICADO', comentario: 'Se ve claro en la foto' });
    darDeBaja();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: reporte.id,
      estadoVerificacion: 'VERIFICADO',
      incidente: { id: reporte.incidenteId, estado: 'VERIFICADO' },
      vecino: { reputacion: 66.67 },
    });
    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(guardado.estadoVerificacion).toBe('VERIFICADO');
    expect(await historial(vecino.id)).toMatchObject({ reportesConfirmados: 1, reportesDesestimados: 0 });
    expect(await movimientos(reporte.incidenteId)).toEqual([
      expect.objectContaining({
        tipo: 'CAMBIO_ESTADO',
        usuarioId: operador.id,
        estadoAnterior: 'REGISTRADO',
        estadoNuevo: 'VERIFICADO',
        comentario: `Reporte #${reporte.id} verificado por el operador: Se ve claro en la foto`,
      }),
    ]);
    // Avisa al módulo de prioridad (#61), dentro de la transacción.
    expect(recalcular).toHaveBeenCalledWith(expect.anything(), reporte.incidenteId);
  });

  it('desestimar el único reporte desestima el incidente y baja la reputación', async () => {
    const vecino = await crearVecino();
    const reporte = await reportar(vecino, { verificado: false });

    const res = await revisar(reporte.id, { decision: 'DESESTIMADO' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      estadoVerificacion: 'DESESTIMADO',
      incidente: { id: reporte.incidenteId, estado: 'DESESTIMADO' },
      vecino: { reputacion: 33.33 },
    });
    expect(await historial(vecino.id)).toMatchObject({ reportesConfirmados: 0, reportesDesestimados: 1 });
    expect(await movimientos(reporte.incidenteId)).toEqual([
      expect.objectContaining({
        tipo: 'CAMBIO_ESTADO',
        estadoAnterior: 'REGISTRADO',
        estadoNuevo: 'DESESTIMADO',
        comentario: `Reporte #${reporte.id} desestimado por el operador`,
      }),
    ]);
  });

  it('desestimar un reporte de un incidente con otro verificado no cambia su estado, pero sí su severidad', async () => {
    const verificado = await reportar(await crearVecino(), { verificado: true, severidad: 'MODERADA' });
    const pendiente = await reportar(await crearVecino(), { verificado: false, severidad: 'GRAVE' });
    // Los dos en el mismo lugar y de la misma categoría: quedan en el mismo incidente (#53).
    expect(pendiente.incidenteId).toBe(verificado.incidenteId);
    const antes = await prisma.incidente.findUniqueOrThrow({ where: { id: verificado.incidenteId } });
    // Empate entre MODERADA y GRAVE: la consolidada es la más alta.
    expect(antes).toMatchObject({ estado: 'VERIFICADO', severidad: 'GRAVE', cantidadReportes: 2 });

    const res = await revisar(pendiente.id, { decision: 'DESESTIMADO', comentario: 'No es acá' });

    expect(res.status).toBe(200);
    const despues = await prisma.incidente.findUniqueOrThrow({ where: { id: verificado.incidenteId } });
    // El desestimado deja de contar en la cantidad de reportes, que ve el mapa.
    expect(despues).toMatchObject({ estado: 'VERIFICADO', severidad: 'MODERADA', cantidadReportes: 1 });
    expect((await movimientos(verificado.incidenteId)).at(-1)).toMatchObject({
      tipo: 'COMENTARIO',
      usuarioId: operador.id,
      comentario: `Reporte #${pendiente.id} desestimado por el operador: No es acá`,
    });
  });

  it('un operador de otro organismo no puede revisar', async () => {
    const reporte = await reportar(await crearVecino(), { verificado: false });
    const otro = await crearOperador((await crearOrganismo()).area);

    const res = await revisar(reporte.id, { decision: 'VERIFICADO' }, otro.token);

    expect(res.status).toBe(403);
    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(guardado.estadoVerificacion).toBe('PENDIENTE_REVISION');
  });

  it('un reporte ya revisado no se vuelve a revisar', async () => {
    const vecino = await crearVecino();
    const reporte = await reportar(vecino, { verificado: false });
    await revisar(reporte.id, { decision: 'VERIFICADO' });

    const res = await revisar(reporte.id, { decision: 'DESESTIMADO' });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('REPORTE_YA_REVISADO');
    expect(await historial(vecino.id)).toMatchObject({ reportesConfirmados: 1, reportesDesestimados: 0 });
  });

  it('tampoco uno que el sistema ya verificó al recibirlo', async () => {
    const reporte = await reportar(await crearVecino(), { verificado: true });

    const res = await revisar(reporte.id, { decision: 'DESESTIMADO' });

    expect(res.status).toBe(409);
  });

  it('dos revisiones a la vez: una se aplica y la otra encuentra el reporte ya revisado', async () => {
    const vecino = await crearVecino();
    const reporte = await reportar(vecino, { verificado: false });

    const respuestas = await Promise.all([
      revisar(reporte.id, { decision: 'VERIFICADO' }),
      revisar(reporte.id, { decision: 'DESESTIMADO' }),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    const vecinoDespues = await historial(vecino.id);
    expect(vecinoDespues.reportesConfirmados + vecinoDespues.reportesDesestimados).toBe(1);
  });

  it('un reporte que no existe da 404', async () => {
    const res = await revisar(2_000_000_000, { decision: 'VERIFICADO' });

    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('REPORTE_NO_ENCONTRADO');
  });

  it('valida la decisión y el comentario', async () => {
    const reporte = await reportar(await crearVecino(), { verificado: false });

    const sinDecision = await revisar(reporte.id, {});
    const otraDecision = await revisar(reporte.id, { decision: 'PENDIENTE_REVISION' });
    const largo = await revisar(reporte.id, { decision: 'VERIFICADO', comentario: 'x'.repeat(1001) });

    expect([sinDecision.status, otraDecision.status, largo.status]).toEqual([400, 400, 400]);
    expect(otraDecision.body.error.detalles).toContainEqual({
      campo: 'decision',
      mensaje: 'Tiene que ser VERIFICADO o DESESTIMADO',
    });
  });

  it('un vecino no puede revisar', async () => {
    const vecino = await crearVecino();
    const reporte = await reportar(vecino, { verificado: false });

    const res = await revisar(reporte.id, { decision: 'VERIFICADO' }, crearTokenAcceso(vecino));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/reportes', () => {
  const todos = (consulta: Record<string, string> = {}, conToken = token) =>
    request(app).get('/api/reportes').query(consulta).set('Authorization', `Bearer ${conToken}`);

  it('lista los reportes del organismo en cualquier estado, del más nuevo al más viejo', async () => {
    const verificado = await reportar(await crearVecino(), { verificado: true });
    const pendiente = await reportar(await crearVecino(), { verificado: false });
    const desestimado = await reportar(await crearVecino(), { verificado: false });
    await revisar(desestimado.id, { decision: 'DESESTIMADO' });

    const res = await todos();

    expect(res.status).toBe(200);
    const propios = res.body.reportes.filter((r: { id: number }) =>
      [verificado.id, pendiente.id, desestimado.id].includes(r.id),
    );
    expect(
      propios.map((r: { id: number; estadoVerificacion: string }) => [r.id, r.estadoVerificacion]),
    ).toEqual([
      [desestimado.id, 'DESESTIMADO'],
      [pendiente.id, 'PENDIENTE_REVISION'],
      [verificado.id, 'VERIFICADO'],
    ]);
    // Con los mismos datos que un pendiente, y sin publicación de la IA (lo decidieron el sistema y un operador).
    expect(propios[0]).toMatchObject({
      categoria: { id: categoria.id },
      senales: expect.any(Array),
      vecino: expect.objectContaining({ reputacion: expect.any(Number) }),
      propuestaIa: null,
      publicadoPorIaEn: null,
    });
  });

  it('filtra por estado y por categoría', async () => {
    const verificado = await reportar(await crearVecino(), { verificado: true });
    const pendiente = await reportar(await crearVecino(), { verificado: false });

    const verificados = await todos({ estado: 'VERIFICADO' });
    const deOtraCategoria = await todos({ categoriaId: '2000000000' });
    const deEsta = await todos({ categoriaId: String(categoria.id) });

    const ids = (res: request.Response) => res.body.reportes.map((r: { id: number }) => r.id);
    expect(ids(verificados)).toContain(verificado.id);
    expect(ids(verificados)).not.toContain(pendiente.id);
    expect(ids(deOtraCategoria)).toEqual([]);
    expect(ids(deEsta).sort()).toEqual([verificado.id, pendiente.id].sort());
  });

  it('no incluye los de otros organismos', async () => {
    const reporte = await reportar(await crearVecino(), { verificado: true });
    const otro = await crearOperador((await crearOrganismo()).area);

    const res = await todos({}, otro.token);

    expect(res.body.reportes.map((r: { id: number }) => r.id)).not.toContain(reporte.id);
  });

  it('valida los filtros', async () => {
    const res = await todos({ estado: 'PUBLICADO' });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toContainEqual({
      campo: 'estado',
      mensaje: 'Tiene que ser PENDIENTE_REVISION, VERIFICADO o DESESTIMADO',
    });
  });

  it('un vecino no puede verlo', async () => {
    const res = await todos({}, crearTokenAcceso(await crearVecino()));

    expect(res.status).toBe(403);
  });
});
