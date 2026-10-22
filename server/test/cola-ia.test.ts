import { randomUUID } from 'node:crypto';
import type { Area, Categoria, Severidad, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { clasificarImagen, type Clasificacion } from '../src/modulos/ia/clasificarFoto.js';
import { esperarProceso } from '../src/modulos/ia/cola.js';
import { IaNoDisponible } from '../src/modulos/ia/servicio.js';
import { modoDemostracion } from '../src/modulos/verificacion/repositorio.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { EXIF_DE_PRUEBA, fotoUnica, jpegConExif, jpegLiso } from './imagenes.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));
// La IA simulada: cada test decide qué responde para cada reporte.
vi.mock('../src/modulos/ia/clasificarFoto.js', async (original) => ({
  ...(await original<typeof import('../src/modulos/ia/clasificarFoto.js')>()),
  clasificarImagen: vi.fn(),
}));
// El modo demostración es un parámetro de toda la base: si se prendiera de verdad, cambiaría los reportes de
// los tests que corren en paralelo. Acá se simula.
vi.mock('../src/modulos/verificacion/repositorio.js', async (original) => ({
  ...(await original<typeof import('../src/modulos/verificacion/repositorio.js')>()),
  modoDemostracion: vi.fn(async () => false),
}));

const clasificar = vi.mocked(clasificarImagen);

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let categoria: Categoria;
let otraCategoria: Categoria;
let operador: Usuario;
let token: string;
let lat: number;

async function crearOperador(enArea: Area) {
  const usuario = await crearUsuario({ rol: 'OPERADOR' });
  const conOrganismo = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { organismoId: enArea.organismoId, areaId: enArea.id },
  });
  return { operador: conOrganismo, token: crearTokenAcceso(conOrganismo) };
}

async function crearOrganismo() {
  const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
  return prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
}

beforeEach(async () => {
  clasificar.mockReset();
  vi.mocked(modoDemostracion).mockResolvedValue(false);
  area = await crearOrganismo();
  categoria = await prisma.categoria.create({ data: { nombre: `Pozo ${randomUUID()}`, areaId: area.id } });
  otraCategoria = await prisma.categoria.create({
    data: { nombre: `Vereda ${randomUUID()}`, areaId: area.id },
  });
  ({ operador, token } = await crearOperador(area));
  lat = -38.9 - Math.random() * 0.05;
});

/** Un reporte pendiente (foto de galería sin EXIF), en su propia cuadra para que no se agrupe. */
async function reportar(severidad: Severidad, cuadra: number) {
  const vecino = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(vecino.id);
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(categoria.id))
    .field('severidadDeclarada', severidad)
    .field('lat', String(lat - cuadra * 0.001))
    .field('lon', '-68.06')
    .field('origen', 'SITIO_WEB')
    .field('registradoEn', `2026-10-1${cuadra}T10:00:00Z`)
    .attach('foto', await jpegLiso(100 + cuadra), 'foto.jpg');
  expect(res.status).toBe(201);
  expect(res.body.estadoVerificacion).toBe('PENDIENTE_REVISION');
  return { ...(res.body as { id: number; incidenteId: number }), vecino };
}

/** Lo que "responde la IA": deja su consulta en registro_ia, como el servicio real. */
async function respuesta(categoriaId: number, severidad: Severidad): Promise<Clasificacion> {
  const registro = await prisma.registroIa.create({
    data: {
      tipo: 'CLASIFICACION_IMAGEN',
      proveedor: 'ANTHROPIC',
      modelo: 'claude-haiku-5-5',
      usuarioId: operador.id,
      salida: { categoriaId, severidad, explicacion: 'Se ve un pozo profundo en la calzada.' },
      duracionMs: 3000,
    },
  });
  return {
    categoriaId,
    severidad,
    registroIaId: registro.id,
    explicacion: 'Se ve un pozo profundo en la calzada.',
    uso: { entrada: 1500, salida: 200 },
  };
}

const procesar = (conToken = token) =>
  request(app).post('/api/ia/procesar-cola').set('Authorization', `Bearer ${conToken}`);

const verProceso = (id: string, conToken = token) =>
  request(app).get(`/api/ia/procesos/${id}`).set('Authorization', `Bearer ${conToken}`);

async function procesarYEsperar() {
  const res = await procesar();
  expect(res.status).toBe(202);
  await esperarProceso(res.body.procesoId);
  return (await verProceso(res.body.procesoId)).body;
}

const estadosDe = (log: { eventos: { estado: string; reporte: { id: number } }[] }, reporteId: number) =>
  log.eventos.filter((e) => e.reporte.id === reporteId).map((e) => e.estado);

describe('POST /api/ia/procesar-cola', () => {
  it('si la IA coincide con el vecino, publica el reporte y lo deja en el log', async () => {
    const reporte = await reportar('GRAVE', 1);
    clasificar.mockImplementation(async () => respuesta(categoria.id, 'GRAVE'));

    const log = await procesarYEsperar();

    expect(estadosDe(log, reporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'PUBLICADO']);
    const clasificado = log.eventos.find((e: { estado: string }) => e.estado === 'CLASIFICADO');
    expect(clasificado.detalle).toBe(
      `La IA propone ${categoria.nombre}, GRAVE; el vecino eligió ${categoria.nombre}, GRAVE. Se ve un pozo profundo en la calzada.`,
    );
    expect(clasificado.propuesta).toMatchObject({
      categoriaId: categoria.id,
      severidad: 'GRAVE',
      explicacion: 'Se ve un pozo profundo en la calzada.',
    });
    expect(clasificado.reporte.foto.url).toMatch(/^\/api\/fotos\/\d+$/);

    // Publicado igual que una aprobación manual (#51): reporte, incidente, reputación y bitácora.
    const guardado = await prisma.reporte.findUniqueOrThrow({
      where: { id: reporte.id },
      include: { incidente: true },
    });
    expect(guardado.estadoVerificacion).toBe('VERIFICADO');
    expect(guardado.incidente!.estado).toBe('VERIFICADO');
    const vecino = await prisma.usuario.findUniqueOrThrow({ where: { id: reporte.vecino.id } });
    expect(Number(vecino.reputacion)).toBe(66.67);
    const [movimiento] = await prisma.movimientoIncidente.findMany({
      where: { incidenteId: reporte.incidenteId },
    });
    expect(movimiento).toMatchObject({
      tipo: 'CAMBIO_ESTADO',
      usuarioId: operador.id,
      comentario: `Reporte #${reporte.id} verificado por la IA al procesar la cola de verificación: coincide con la categoría y la gravedad que eligió el vecino`,
    });
    // En el listado general figura que lo publicó la IA, y cuándo.
    const listado = await request(app).get('/api/reportes').set('Authorization', `Bearer ${token}`);
    expect(listado.body.reportes.find((r: { id: number }) => r.id === reporte.id)).toMatchObject({
      estadoVerificacion: 'VERIFICADO',
      publicadoPorIaEn: expect.any(String),
    });
    // La clasificación se pidió con explicación, a nombre del operador.
    expect(clasificar).toHaveBeenCalledWith(operador.id, expect.any(Buffer), { conExplicacion: true });
  });

  it('si no coincide, lo deja pendiente para revisión manual', async () => {
    const otraGravedad = await reportar('LEVE', 1);
    const otraCategoriaReporte = await reportar('GRAVE', 2);
    clasificar
      .mockImplementationOnce(async () => respuesta(categoria.id, 'GRAVE'))
      .mockImplementationOnce(async () => respuesta(otraCategoria.id, 'GRAVE'));

    const log = await procesarYEsperar();

    expect(estadosDe(log, otraGravedad.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    expect(estadosDe(log, otraCategoriaReporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    const pendientes = await prisma.reporte.findMany({
      where: { id: { in: [otraGravedad.id, otraCategoriaReporte.id] } },
    });
    expect(pendientes.every((r) => r.estadoVerificacion === 'PENDIENTE_REVISION')).toBe(true);

    // En la cola manual, el operador ve qué propuso la IA y por qué lo derivó.
    const cola = await request(app).get('/api/reportes/pendientes').set('Authorization', `Bearer ${token}`);
    const derivado = cola.body.reportes.find((r: { id: number }) => r.id === otraCategoriaReporte.id);
    expect(derivado.propuestaIa).toEqual({
      categoriaId: otraCategoria.id,
      severidad: 'GRAVE',
      explicacion: 'Se ve un pozo profundo en la calzada.',
      creadoEn: expect.any(String),
    });
  });

  it('si la IA falla, el reporte queda en la cola manual y sigue con los demás', async () => {
    const falla = await reportar('GRAVE', 1);
    const sigue = await reportar('GRAVE', 2);
    clasificar
      .mockImplementationOnce(async () => {
        throw new IaNoDisponible('La API tardó más de 30000 ms');
      })
      .mockImplementationOnce(async () => respuesta(categoria.id, 'GRAVE'));

    const log = await procesarYEsperar();

    expect(estadosDe(log, falla.id)).toEqual(['EN_PROCESO', 'ERROR']);
    expect(log.eventos.find((e: { estado: string }) => e.estado === 'ERROR').detalle).toBe(
      'IA no disponible (La API tardó más de 30000 ms): queda en la cola manual',
    );
    expect(estadosDe(log, sigue.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'PUBLICADO']);
    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: falla.id } });
    expect(guardado.estadoVerificacion).toBe('PENDIENTE_REVISION');
  });

  it('si un operador lo revisó mientras la IA lo procesaba, respeta su decisión', async () => {
    const reporte = await reportar('GRAVE', 1);
    clasificar.mockImplementation(async () => {
      await prisma.reporte.update({ where: { id: reporte.id }, data: { estadoVerificacion: 'DESESTIMADO' } });
      return respuesta(categoria.id, 'GRAVE');
    });

    const log = await procesarYEsperar();

    expect(estadosDe(log, reporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'ERROR']);
    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(guardado.estadoVerificacion).toBe('DESESTIMADO');
  });

  it('el resumen cuenta cómo terminó cada reporte, el tiempo medio y el costo', async () => {
    await reportar('GRAVE', 1);
    await reportar('LEVE', 2);
    await reportar('GRAVE', 3);
    clasificar
      .mockImplementationOnce(async () => respuesta(categoria.id, 'GRAVE'))
      .mockImplementationOnce(async () => respuesta(categoria.id, 'GRAVE'))
      .mockImplementationOnce(async () => {
        throw new IaNoDisponible('Se superó el límite de uso de la API (429)');
      });

    const log = await procesarYEsperar();

    expect(log.enCurso).toBe(false);
    expect(log.resumen).toEqual({
      total: 3,
      procesados: 3,
      publicados: 1,
      derivados: 1,
      errores: 1,
      tiempoMedioMs: 3000,
      // Dos clasificaciones de 1500 + 200 tokens con Haiku 5.5: 2 × (1500 × 0,10 + 200 × 0,50) / 1.000.000.
      costoUsd: expect.closeTo(0.0005, 10),
    });
  });

  it('no arranca un segundo procesamiento mientras hay uno en curso', async () => {
    await reportar('GRAVE', 1);
    let soltar = () => {};
    clasificar.mockImplementation(async () => {
      await new Promise<void>((listo) => (soltar = listo));
      return respuesta(categoria.id, 'GRAVE');
    });

    const primero = await procesar();
    const segundo = await procesar();
    expect((await verProceso(primero.body.procesoId)).body.enCurso).toBe(true);
    await vi.waitFor(() => expect(clasificar).toHaveBeenCalled());
    soltar();
    await esperarProceso(primero.body.procesoId);

    expect(primero.status).toBe(202);
    expect(segundo.status).toBe(409);
    expect(segundo.body.error.codigo).toBe('PROCESO_EN_CURSO');
  });

  it('dos pedidos simultáneos arrancan un solo procesamiento', async () => {
    await reportar('GRAVE', 1);
    clasificar.mockImplementation(async () => respuesta(categoria.id, 'GRAVE'));

    const respuestas = await Promise.all([procesar(), procesar()]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([202, 409]);
    await esperarProceso(respuestas.find((r) => r.status === 202)!.body.procesoId);
  });

  it('con la cola vacía responde 409', async () => {
    const res = await procesar();

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('COLA_VACIA');
  });

  it('solo procesa los pendientes del organismo del operador', async () => {
    const propio = await reportar('GRAVE', 1);
    const ajena = await prisma.categoria.create({
      data: { nombre: `Ajena ${randomUUID()}`, areaId: (await crearOrganismo()).id },
    });
    const vecino = await crearUsuario({ rol: 'VECINO' });
    vecinos.push(vecino.id);
    const deOtro = await request(app)
      .post('/api/reportes')
      .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
      .field('categoriaId', String(ajena.id))
      .field('severidadDeclarada', 'GRAVE')
      .field('lat', String(lat))
      .field('lon', '-68.07')
      .field('origen', 'SITIO_WEB')
      .attach('foto', await jpegLiso(90), 'foto.jpg');
    clasificar.mockImplementation(async () => respuesta(categoria.id, 'GRAVE'));

    const log = await procesarYEsperar();

    const procesados = new Set(log.eventos.map((e: { reporte: { id: number } }) => e.reporte.id));
    expect(procesados).toEqual(new Set([propio.id]));
    expect(procesados.has(deOtro.body.id)).toBe(false);
  });

  it('un vecino no puede procesar la cola', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });

    const res = await procesar(crearTokenAcceso(vecino));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/ia/procesos', () => {
  it('un operador de otro organismo no ve el log', async () => {
    await reportar('GRAVE', 1);
    clasificar.mockImplementation(async () => respuesta(categoria.id, 'GRAVE'));
    const res = await procesar();
    await esperarProceso(res.body.procesoId);
    const otro = await crearOperador(await crearOrganismo());

    const ajeno = await verProceso(res.body.procesoId, otro.token);
    const inexistente = await verProceso(randomUUID());
    const invalido = await verProceso('no-es-un-uuid');

    expect(ajeno.status).toBe(403);
    expect(inexistente.status).toBe(404);
    expect(invalido.status).toBe(400);
  });

  it('lista los procesamientos del organismo, del más nuevo al más viejo', async () => {
    await reportar('GRAVE', 1);
    clasificar.mockImplementation(async () => respuesta(categoria.id, 'GRAVE'));
    const primero = await procesar();
    await esperarProceso(primero.body.procesoId);

    const res = await request(app).get('/api/ia/procesos').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.procesos[0]).toEqual({
      id: primero.body.procesoId,
      iniciadoEn: expect.any(String),
      reportes: 1,
      publicados: 1,
      derivados: 0,
      errores: 0,
      enCurso: false,
    });
  });
});

describe('modo demostración', () => {
  it('manda a la cola un reporte que la verificación automática aprobaría', async () => {
    vi.mocked(modoDemostracion).mockResolvedValue(true);
    const vecino = await crearUsuario({ rol: 'VECINO' });
    vecinos.push(vecino.id);

    // Cámara de la app y GPS en el punto: sin el modo demo quedaría verificado.
    const res = await request(app)
      .post('/api/reportes')
      .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
      .field('categoriaId', String(categoria.id))
      .field('severidadDeclarada', 'GRAVE')
      .field('lat', String(EXIF_DE_PRUEBA.latitud))
      .field('lon', String(EXIF_DE_PRUEBA.longitud))
      .field('origen', 'APP_MOVIL')
      .field('tomadaConCamaraApp', 'true')
      .field('registradoEn', '2026-10-15T18:00:00Z')
      .attach('foto', await fotoUnica(jpegConExif()), 'foto.jpg');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nivelConfianza: 85, estadoVerificacion: 'PENDIENTE_REVISION' });
    const incidente = await prisma.incidente.findUniqueOrThrow({ where: { id: res.body.incidenteId } });
    expect(incidente.estado).toBe('REGISTRADO');
  });
});
