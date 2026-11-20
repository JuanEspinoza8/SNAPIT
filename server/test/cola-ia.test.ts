import { randomUUID } from 'node:crypto';
import type { Area, Categoria, Severidad, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { listarCategoriasActivas } from '../src/modulos/catalogo/repositorio.js';
import { esperarProceso } from '../src/modulos/ia/cola.js';
import { IaNoDisponible } from '../src/modulos/ia/servicio.js';
import { type Verificacion, verificarFoto } from '../src/modulos/ia/verificarFoto.js';
import type { AnalisisFoto } from '../src/modulos/verificacion/calculo.js';
import { borrarReportesDe, crearUsuario, verificarReporte } from './apoyo.js';
import { jpegLiso } from './imagenes.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));
// La IA simulada: cada test decide qué responde para cada reporte.
vi.mock('../src/modulos/ia/verificarFoto.js', () => ({ verificarFoto: vi.fn() }));

// Para simular que la base falla justo al arrancar el procesamiento.
vi.mock('../src/modulos/catalogo/repositorio.js', async (original) => {
  const real = await original<typeof import('../src/modulos/catalogo/repositorio.js')>();
  return { ...real, listarCategoriasActivas: vi.fn(real.listarCategoriasActivas) };
});

const verificar = vi.mocked(verificarFoto);

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
  verificar.mockReset();
  area = await crearOrganismo();
  categoria = await prisma.categoria.create({ data: { nombre: `Pozo ${randomUUID()}`, areaId: area.id } });
  otraCategoria = await prisma.categoria.create({
    data: { nombre: `Vereda ${randomUUID()}`, areaId: area.id },
  });
  ({ operador, token } = await crearOperador(area));
  lat = -38.9 - Math.random() * 0.05;
});

/**
 * Un reporte pendiente (foto lisa sin EXIF) en la cuadra `cuadra`: los de cuadras distintas no se agrupan, los
 * de la misma sí. Salvo con `enElPunto: false`, se simula que la foto se sacó en el punto: su control de
 * ubicación pasa a EXIF_COINCIDE.
 */
async function reportar(severidad: Severidad, cuadra: number, { enElPunto = true } = {}) {
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
  if (enElPunto) {
    await prisma.senalVerificacion.updateMany({
      where: { reporteId: res.body.id, tipo: 'EXIF_AUSENTE' },
      data: { tipo: 'EXIF_COINCIDE', valor: 1, detalle: 'La foto se sacó a 5 m del punto reportado' },
    });
  }
  return { ...(res.body as { id: number; incidenteId: number }), vecino };
}

const EXPLICACION = 'Se ve un pozo profundo en la calzada.';

/** Lo que "responde la IA": deja su consulta en registro_ia, como el servicio real. */
async function respuesta(cambios: Partial<AnalisisFoto> = {}): Promise<Verificacion> {
  const analisis: AnalisisFoto = {
    esProblemaViaPublica: true,
    categoriaId: categoria.id,
    severidad: 'GRAVE',
    mismoProblema: null,
    datosPersonales: false,
    ...cambios,
  };
  const registro = await prisma.registroIa.create({
    data: {
      tipo: 'CLASIFICACION_IMAGEN',
      proveedor: 'ANTHROPIC',
      modelo: 'claude-haiku-5-5',
      usuarioId: operador.id,
      salida: { ...analisis, explicacion: EXPLICACION },
      duracionMs: 3000,
    },
  });
  return {
    ...analisis,
    explicacion: EXPLICACION,
    registroIaId: registro.id,
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

type Log = { eventos: { estado: string; detalle: string; reporte: { id: number } }[] };

const estadosDe = (log: Log, reporteId: number) =>
  log.eventos.filter((e) => e.reporte.id === reporteId).map((e) => e.estado);

const ultimoDe = (log: Log, reporteId: number) =>
  log.eventos.filter((e) => e.reporte.id === reporteId).at(-1)!;

const estadoDe = async (reporteId: number) =>
  (await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } })).estadoVerificacion;

describe('POST /api/ia/procesar-cola', () => {
  it('si la foto muestra lo que eligió el vecino y se sacó en el punto, lo publica y lo deja en el log', async () => {
    const reporte = await reportar('GRAVE', 1);
    verificar.mockImplementation(async () => respuesta());

    const log = await procesarYEsperar();

    expect(estadosDe(log, reporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'PUBLICADO']);
    const clasificado = log.eventos.find((e: { estado: string }) => e.estado === 'CLASIFICADO')!;
    expect(clasificado.detalle).toBe(
      `La IA ve ${categoria.nombre}, GRAVE; el vecino eligió ${categoria.nombre}, GRAVE. ${EXPLICACION}`,
    );
    expect((clasificado as unknown as { propuesta: object }).propuesta).toMatchObject({
      esProblemaViaPublica: true,
      categoriaId: categoria.id,
      severidad: 'GRAVE',
      mismoProblema: null,
      datosPersonales: false,
      explicacion: EXPLICACION,
    });
    expect(ultimoDe(log, reporte.id).detalle).toBe(
      'Coincide con lo que eligió el vecino y la foto se sacó en el punto: publicado',
    );

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
      comentario: `Reporte #${reporte.id} verificado por la IA al procesar la cola de verificación: coincide con la categoría y la gravedad que eligió el vecino, y la foto se sacó en el punto`,
    });
    // En el listado general figura que lo publicó la IA, y cuándo.
    const listado = await request(app).get('/api/reportes').set('Authorization', `Bearer ${token}`);
    expect(listado.body.reportes.find((r: { id: number }) => r.id === reporte.id)).toMatchObject({
      estadoVerificacion: 'VERIFICADO',
      publicadoPorIaEn: expect.any(String),
    });
    // La consulta se pidió a nombre del operador, sin foto de referencia: el incidente no tenía otro reporte.
    expect(verificar).toHaveBeenCalledWith(operador.id, expect.any(Buffer), null);
  });

  it('si la foto no muestra un problema de la vía pública, no lo desestima: queda para que un operador lo confirme', async () => {
    const reporte = await reportar('GRAVE', 1);
    verificar.mockImplementation(async () =>
      respuesta({ esProblemaViaPublica: false, categoriaId: null, severidad: null }),
    );

    const log = await procesarYEsperar();

    expect(estadosDe(log, reporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    expect(log.eventos.find((e: { estado: string }) => e.estado === 'CLASIFICADO')!.detalle).toBe(
      `La IA no ve un problema de la vía pública. ${EXPLICACION}`,
    );
    expect(ultimoDe(log, reporte.id).detalle).toContain('desestimados pendientes');
    expect(log.resumen).toMatchObject({ desestimados: 1, derivados: 0, publicados: 0 });
    // La IA nunca desestima: sigue pendiente, sin tocar la reputación del vecino.
    expect(await estadoDe(reporte.id)).toBe('PENDIENTE_REVISION');
    const vecino = await prisma.usuario.findUniqueOrThrow({ where: { id: reporte.vecino.id } });
    expect(vecino.reportesDesestimados).toBe(0);
  });

  it('si la IA ve otra categoría u otra gravedad, lo deja para revisión manual con su propuesta', async () => {
    const otraGravedad = await reportar('LEVE', 1);
    const otraCategoriaReporte = await reportar('GRAVE', 2);
    verificar
      .mockImplementationOnce(async () => respuesta())
      .mockImplementationOnce(async () => respuesta({ categoriaId: otraCategoria.id }));

    const log = await procesarYEsperar();

    expect(estadosDe(log, otraGravedad.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    expect(estadosDe(log, otraCategoriaReporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    expect(ultimoDe(log, otraGravedad.id).detalle).toBe(
      'La IA ve otra categoría o gravedad que la que eligió el vecino: queda para revisión manual',
    );
    expect(await estadoDe(otraGravedad.id)).toBe('PENDIENTE_REVISION');

    // En la cola manual, el operador ve qué propuso la IA.
    const cola = await request(app).get('/api/reportes/pendientes').set('Authorization', `Bearer ${token}`);
    const derivado = cola.body.reportes.find((r: { id: number }) => r.id === otraCategoriaReporte.id);
    expect(derivado.propuestaIa).toEqual({
      categoriaId: otraCategoria.id,
      severidad: 'GRAVE',
      explicacion: EXPLICACION,
      creadoEn: expect.any(String),
      esProblemaViaPublica: true,
      mismoProblema: null,
      datosPersonales: false,
    });
  });

  it('si se ve una cara o una patente, la propuesta que ve el operador lo avisa', async () => {
    const reporte = await reportar('GRAVE', 1);
    verificar.mockImplementationOnce(async () => respuesta({ datosPersonales: true }));

    await procesarYEsperar();

    const cola = await request(app).get('/api/reportes/pendientes').set('Authorization', `Bearer ${token}`);
    const pendiente = cola.body.reportes.find((r: { id: number }) => r.id === reporte.id);
    expect(pendiente.propuestaIa).toMatchObject({ datosPersonales: true, esProblemaViaPublica: true });
  });

  it('sin la ubicación de la foto ni otro reporte verificado con qué compararla, lo decide un operador', async () => {
    const reporte = await reportar('GRAVE', 1, { enElPunto: false });
    verificar.mockImplementation(async () => respuesta());

    const log = await procesarYEsperar();

    expect(ultimoDe(log, reporte.id)).toMatchObject({
      estado: 'REVISION_MANUAL',
      detalle:
        'La foto no trae ubicación y no hay un reporte verificado del incidente para compararla: queda para revisión manual',
    });
    expect(await estadoDe(reporte.id)).toBe('PENDIENTE_REVISION');
  });

  it('sin ubicación, lo publica si es el mismo problema que un reporte ya verificado del incidente', async () => {
    const verificado = await reportar('GRAVE', 1);
    await verificarReporte(verificado.id);
    const sinUbicacion = await reportar('GRAVE', 1, { enElPunto: false });
    expect(sinUbicacion.incidenteId).toBe(verificado.incidenteId);
    verificar.mockImplementation(async () => respuesta({ mismoProblema: true }));

    const log = await procesarYEsperar();

    // Se le mandó la foto del reporte verificado como referencia.
    expect(verificar).toHaveBeenCalledWith(operador.id, expect.any(Buffer), expect.any(Buffer));
    expect(estadosDe(log, sinUbicacion.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'PUBLICADO']);
    expect(log.eventos.find((e: { estado: string }) => e.estado === 'CLASIFICADO')!.detalle).toContain(
      `Es el mismo problema que el reporte #${verificado.id}, ya verificado.`,
    );
    expect(await estadoDe(sinUbicacion.id)).toBe('VERIFICADO');
    const movimientos = await prisma.movimientoIncidente.findMany({
      where: { incidenteId: verificado.incidenteId },
      orderBy: { id: 'asc' },
    });
    expect(movimientos.at(-1)!.comentario).toContain(
      `es el mismo problema que el reporte #${verificado.id}, ya verificado`,
    );
  });

  it('un reporte que la IA publica en el procesamiento ya sirve de referencia para los siguientes', async () => {
    const conGps = await reportar('GRAVE', 1);
    const sinGps = await reportar('GRAVE', 1, { enElPunto: false });
    expect(sinGps.incidenteId).toBe(conGps.incidenteId);
    verificar
      .mockImplementationOnce(async () => respuesta())
      .mockImplementationOnce(async () => respuesta({ mismoProblema: true }));

    const log = await procesarYEsperar();

    expect(estadosDe(log, conGps.id).at(-1)).toBe('PUBLICADO');
    expect(estadosDe(log, sinGps.id).at(-1)).toBe('PUBLICADO');
    // El primero fue sin referencia; el segundo, con la foto del primero.
    expect(verificar.mock.calls.map((llamada) => llamada[2] === null)).toEqual([true, false]);
  });

  it('si no parece el mismo problema que el reporte verificado, lo decide un operador', async () => {
    const verificado = await reportar('GRAVE', 1);
    await verificarReporte(verificado.id);
    const sinUbicacion = await reportar('GRAVE', 1, { enElPunto: false });
    verificar.mockImplementation(async () => respuesta({ mismoProblema: false }));

    const log = await procesarYEsperar();

    expect(ultimoDe(log, sinUbicacion.id).detalle).toContain('no parece el mismo problema');
    expect(await estadoDe(sinUbicacion.id)).toBe('PENDIENTE_REVISION');
  });

  it('si se ve una cara o una patente, no lo publica aunque todo lo demás esté bien', async () => {
    const reporte = await reportar('GRAVE', 1);
    verificar.mockImplementation(async () => respuesta({ datosPersonales: true }));

    const log = await procesarYEsperar();

    expect(log.eventos.find((e: { estado: string }) => e.estado === 'CLASIFICADO')!.detalle).toContain(
      'Se ve una cara o una patente.',
    );
    expect(ultimoDe(log, reporte.id).detalle).toContain('hay que revisar la foto antes de publicarla');
    expect(await estadoDe(reporte.id)).toBe('PENDIENTE_REVISION');
  });

  it('si el vecino había aceptado la sugerencia de la IA, el log lo aclara y el resumen lo cuenta', async () => {
    const reporte = await reportar('GRAVE', 1);
    await prisma.reporte.update({ where: { id: reporte.id }, data: { sugerenciaAceptada: true } });
    verificar.mockImplementation(async () => respuesta());

    const log = await procesarYEsperar();

    expect(estadosDe(log, reporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'PUBLICADO']);
    expect(log.eventos.find((e: { estado: string }) => e.estado === 'CLASIFICADO')!.detalle).toContain(
      `el vecino eligió ${categoria.nombre}, GRAVE (había aceptado la sugerencia de la IA).`,
    );
    expect(log.resumen).toMatchObject({ publicados: 1, publicadosConSugerencia: 1 });
  });

  it('un reporte que la IA ya miró no vuelve a entrar; uno en el que falló, sí', async () => {
    const mirado = await reportar('LEVE', 1);
    const fallido = await reportar('GRAVE', 2);
    verificar
      .mockImplementationOnce(async () => respuesta())
      .mockImplementationOnce(async () => {
        throw new IaNoDisponible('La API tardó más de 30000 ms');
      });
    await procesarYEsperar();
    verificar.mockReset();
    verificar.mockImplementation(async () => respuesta());

    const log = await procesarYEsperar();

    expect(verificar).toHaveBeenCalledOnce();
    expect(estadosDe(log, mirado.id)).toEqual([]);
    expect(estadosDe(log, fallido.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'PUBLICADO']);
  });

  it('si la IA falla, el reporte queda en la cola manual y sigue con los demás', async () => {
    const falla = await reportar('GRAVE', 1);
    const sigue = await reportar('GRAVE', 2);
    verificar
      .mockImplementationOnce(async () => {
        throw new IaNoDisponible('La API tardó más de 30000 ms');
      })
      .mockImplementationOnce(async () => respuesta());

    const log = await procesarYEsperar();

    expect(estadosDe(log, falla.id)).toEqual(['EN_PROCESO', 'ERROR']);
    expect(log.eventos.find((e: { estado: string }) => e.estado === 'ERROR')!.detalle).toBe(
      'IA no disponible (La API tardó más de 30000 ms): queda en la cola manual',
    );
    expect(estadosDe(log, sigue.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'PUBLICADO']);
    expect(await estadoDe(falla.id)).toBe('PENDIENTE_REVISION');
  });

  it('si un operador lo revisó mientras la IA lo procesaba, respeta su decisión', async () => {
    const reporte = await reportar('GRAVE', 1);
    verificar.mockImplementation(async () => {
      await prisma.reporte.update({ where: { id: reporte.id }, data: { estadoVerificacion: 'DESESTIMADO' } });
      return respuesta();
    });

    const log = await procesarYEsperar();

    // No es un error de la IA: lo resolvió una persona.
    expect(estadosDe(log, reporte.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    expect(ultimoDe(log, reporte.id).detalle).toBe(
      'Un operador lo revisó mientras la IA lo procesaba: queda su decisión',
    );
    expect(log.resumen.errores).toBe(0);
    expect(await estadoDe(reporte.id)).toBe('DESESTIMADO');
  });

  it('si un operador lo revisó antes de que le llegue el turno, no se consulta a la IA', async () => {
    const primero = await reportar('GRAVE', 1);
    const segundo = await reportar('GRAVE', 2);
    verificar.mockImplementation(async () => {
      await prisma.reporte.update({ where: { id: segundo.id }, data: { estadoVerificacion: 'VERIFICADO' } });
      return respuesta({ severidad: 'LEVE' });
    });

    const log = await procesarYEsperar();

    expect(verificar).toHaveBeenCalledOnce();
    expect(estadosDe(log, primero.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    expect(estadosDe(log, segundo.id)).toEqual(['REVISION_MANUAL']);
    expect(ultimoDe(log, segundo.id).detalle).toBe('Un operador ya lo revisó: no se consulta a la IA');
    expect(log.resumen.costoUsd).toBeGreaterThan(0);
  });

  it('los pendientes de un incidente cerrado no entran en la cola', async () => {
    const reporte = await reportar('GRAVE', 1);
    await prisma.incidente.update({ where: { id: reporte.incidenteId }, data: { estado: 'DESESTIMADO' } });

    const res = await procesar();

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('COLA_VACIA');
  });

  it('si el incidente se cierra mientras la cola corre, no consulta ni publica sus pendientes', async () => {
    const antes = await reportar('GRAVE', 1);
    const despues = await reportar('GRAVE', 2);
    verificar.mockImplementation(async () => {
      // Al mirar el primero se cierran los dos: el primero ya está analizado y el segundo, en espera.
      await prisma.incidente.updateMany({
        where: { id: { in: [antes.incidenteId, despues.incidenteId] } },
        data: { estado: 'DESESTIMADO' },
      });
      return respuesta();
    });

    const log = await procesarYEsperar();

    expect(verificar).toHaveBeenCalledOnce();
    expect(estadosDe(log, antes.id)).toEqual(['EN_PROCESO', 'CLASIFICADO', 'REVISION_MANUAL']);
    expect(estadosDe(log, despues.id)).toEqual(['REVISION_MANUAL']);
    expect([ultimoDe(log, antes.id).detalle, ultimoDe(log, despues.id).detalle]).toEqual([
      'El incidente se cerró mientras la IA lo procesaba: no se publica',
      'El incidente ya está cerrado: no se consulta a la IA',
    ]);
    expect([await estadoDe(antes.id), await estadoDe(despues.id)]).toEqual([
      'PENDIENTE_REVISION',
      'PENDIENTE_REVISION',
    ]);
  });

  it('si la base falla al arrancar, deja un error por reporte y el servidor sigue', async () => {
    const reporte = await reportar('GRAVE', 1);
    vi.mocked(listarCategoriasActivas).mockRejectedValueOnce(new Error('Se cortó la conexión'));

    const log = await procesarYEsperar();

    expect(verificar).not.toHaveBeenCalled();
    expect(estadosDe(log, reporte.id)).toEqual(['ERROR']);
    expect(log.eventos[0]!.detalle).toBe('No se pudo arrancar el procesamiento: queda en la cola manual');
    expect(log.enCurso).toBe(false);
  });

  it('el resumen cuenta cómo terminó cada reporte, el tiempo medio y el costo', async () => {
    await reportar('GRAVE', 1);
    await reportar('LEVE', 2);
    await reportar('GRAVE', 3);
    await reportar('GRAVE', 4);
    verificar
      .mockImplementationOnce(async () => respuesta())
      .mockImplementationOnce(async () => respuesta())
      .mockImplementationOnce(async () =>
        respuesta({ esProblemaViaPublica: false, categoriaId: null, severidad: null }),
      )
      .mockImplementationOnce(async () => {
        throw new IaNoDisponible('Se superó el límite de uso de la API (429)');
      });

    const log = await procesarYEsperar();

    expect(log.enCurso).toBe(false);
    expect(log.resumen).toEqual({
      total: 4,
      procesados: 4,
      publicados: 1,
      publicadosConSugerencia: 0,
      derivados: 1,
      desestimados: 1,
      errores: 1,
      tiempoMedioMs: 3000,
      // Tres consultas de 1500 + 200 tokens con Haiku 5.5: 3 × (1500 × 0,10 + 200 × 0,50) / 1.000.000.
      costoUsd: expect.closeTo(0.00075, 10),
    });
  });

  it('no arranca un segundo procesamiento mientras hay uno en curso', async () => {
    await reportar('GRAVE', 1);
    let soltar = () => {};
    verificar.mockImplementation(async () => {
      await new Promise<void>((listo) => (soltar = listo));
      return respuesta();
    });

    const primero = await procesar();
    const segundo = await procesar();
    expect((await verProceso(primero.body.procesoId)).body.enCurso).toBe(true);
    await vi.waitFor(() => expect(verificar).toHaveBeenCalled());
    soltar();
    await esperarProceso(primero.body.procesoId);

    expect(primero.status).toBe(202);
    expect(segundo.status).toBe(409);
    expect(segundo.body.error.codigo).toBe('PROCESO_EN_CURSO');
  });

  it('dos pedidos simultáneos arrancan un solo procesamiento', async () => {
    await reportar('GRAVE', 1);
    verificar.mockImplementation(async () => respuesta());

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
    verificar.mockImplementation(async () => respuesta());

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
    verificar.mockImplementation(async () => respuesta());
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

  it('lista los procesamientos del organismo, del más nuevo al más viejo, con los desestimados aparte', async () => {
    await reportar('GRAVE', 1);
    await reportar('GRAVE', 2);
    verificar
      .mockImplementationOnce(async () => respuesta())
      .mockImplementationOnce(async () =>
        respuesta({ esProblemaViaPublica: false, categoriaId: null, severidad: null }),
      );
    const primero = await procesar();
    await esperarProceso(primero.body.procesoId);

    const res = await request(app).get('/api/ia/procesos').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.procesos[0]).toEqual({
      id: primero.body.procesoId,
      iniciadoEn: expect.any(String),
      reportes: 2,
      publicados: 1,
      derivados: 0,
      desestimados: 1,
      errores: 0,
      enCurso: false,
    });
  });
});
