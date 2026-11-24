import { randomUUID } from 'node:crypto';
import type { Area, Categoria, EstadoIncidente, Organismo } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { env } from '../src/config/env.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearServicioIa, servicioIa } from '../src/modulos/ia/servicio.js';
import { crearOrganismoDePrueba, crearUsuario } from './apoyo.js';

/*
 * Un organismo con dos áreas: A (categoría X) y B (categoría Y), y incidentes cargados a mano en enero de 2026
 * (hora de Argentina), más uno de diciembre que sigue abierto. El informe se pide siempre por enero.
 */

// La API de Claude simulada: ningún test sale a la red ni gasta.
const fetchSimulado = vi.fn<typeof fetch>();
const servicioSimulado = (apiKey: string | undefined = 'clave-de-prueba') =>
  crearServicioIa({ apiKey, modelo: 'claude-haiku-5-5', timeoutMs: 5_000, fetch: fetchSimulado });

/** La API responde este JSON como texto. */
const responder = (json: unknown) =>
  new Response(
    JSON.stringify({
      id: 'msg_prueba',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: JSON.stringify(json) }],
      stop_reason: 'end_turn',
      stop_details: null,
      usage: { input_tokens: 3000, output_tokens: 900 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

/** Un informe de la IA con estos ids en el orden de intervención. */
const informeIa = (ids: number[] = []) => ({
  estadoGeneral: 'Quedan abiertos tres incidentes.',
  zonasCriticas: 'El Centro concentra la mayoría.',
  categoriasFrecuentes: 'Predominan los de la categoría X.',
  demoras: 'X tarda doce días en resolverse.',
  ordenDeIntervencion: ids.map((incidenteId) => ({
    incidenteId,
    justificacion: 'Tiene la prioridad más alta.',
  })),
});

/** Lo que el servidor le mandó a la API en el primer pedido. */
const pedidoEnviado = () => JSON.parse(String(fetchSimulado.mock.calls[0]![1]?.body));
/** Los datos que viajaron entre <datos> y </datos>, ya parseados. */
function datosEnviados() {
  const texto = pedidoEnviado().messages[0].content.find((bloque: { type: string }) => bloque.type === 'text')
    .text as string;
  const [, json] = texto.match(/^<datos>\n([\s\S]*)\n<\/datos>$/)!;
  return JSON.parse(json!);
}

const s = randomUUID().slice(0, 8);
const CENTRO = `Centro ${s}`;
const BOUQUET = `Bouquet Roldán ${s}`;
const ENERO = { desde: '2026-01-01', hasta: '2026-01-31' };

let organismo: Organismo;
let areaA: Area;
let areaB: Area;
let x: Categoria;
let y: Categoria;
let otroOrganismo: { organismo: Organismo; area: Area; categoria: Categoria };
let token: string;
let tokenAdmin: string;
let tokenOtro: string;
let tokenVecino: string;
let tokenSinOrganismo: string;
let operadorId: number;
const usuarios: number[] = [];
const incidentes: number[] = [];
const ids: Record<string, number> = {};

const ART = (fechaHora: string) => `${fechaHora}-03:00`;

async function incidente(
  categoria: Categoria,
  datos: {
    estado?: EstadoIncidente;
    areaId?: number;
    primerReporteEn: string;
    resueltoEn?: string;
    direccion?: string;
    puntaje?: number;
  },
) {
  const lat = -0.001 * (incidentes.length + 1);
  const [fila] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, area_id, estado, ubicacion, direccion, puntaje_prioridad,
                           primer_reporte_en, resuelto_en)
    VALUES (${categoria.id}, ${datos.areaId ?? null}, ${datos.estado ?? 'VERIFICADO'}::estado_incidente,
            ST_SetSRID(ST_MakePoint(0.004, ${lat}), 4326)::geography, ${datos.direccion ?? null},
            ${datos.puntaje ?? 0}, ${ART(datos.primerReporteEn)}::timestamptz,
            ${datos.resueltoEn ? ART(datos.resueltoEn) : null}::timestamptz)
    RETURNING id`;
  incidentes.push(fila!.id);
  return fila!.id;
}

async function usuario(opciones: Parameters<typeof crearUsuario>[0]) {
  const creado = await crearUsuario(opciones);
  usuarios.push(creado.id);
  return creado;
}

beforeAll(async () => {
  ({ organismo, area: areaA, categoria: x } = await crearOrganismoDePrueba());
  areaB = await prisma.area.create({ data: { organismoId: organismo.id, nombre: `Veredas ${s}` } });
  y = await prisma.categoria.create({ data: { nombre: `Vereda rota ${s}`, areaId: areaB.id } });
  otroOrganismo = await crearOrganismoDePrueba();

  const operador = await usuario({ rol: 'OPERADOR', organismoId: organismo.id, areaId: areaA.id });
  operadorId = operador.id;
  token = crearTokenAcceso(operador);
  tokenAdmin = crearTokenAcceso(await usuario({ rol: 'ADMINISTRADOR', organismoId: organismo.id }));
  tokenOtro = crearTokenAcceso(await usuario({ rol: 'OPERADOR', organismoId: otroOrganismo.organismo.id }));
  tokenVecino = crearTokenAcceso(await usuario({ rol: 'VECINO' }));
  tokenSinOrganismo = crearTokenAcceso(await usuario({ rol: 'ADMINISTRADOR', organismoId: null }));

  ids.enero = await incidente(x, {
    primerReporteEn: '2026-01-05T10:00:00',
    direccion: `Lanín 100, ${CENTRO}`,
    puntaje: 70,
  });
  ids.vereda = await incidente(y, {
    estado: 'DERIVADO',
    areaId: areaB.id,
    primerReporteEn: '2026-01-10T10:00:00',
    direccion: `Roca 50, ${BOUQUET}`,
    puntaje: 40,
  });
  ids.resuelto = await incidente(x, {
    estado: 'RESUELTO',
    primerReporteEn: '2026-01-08T10:00:00',
    resueltoEn: '2026-01-20T10:00:00',
    direccion: `Lanín 300, ${CENTRO}`,
  });
  // De diciembre y todavía abierto: no está en los indicadores de enero, pero sí entre los prioritarios.
  ids.atrasado = await incidente(x, {
    primerReporteEn: '2025-12-15T10:00:00',
    direccion: `Lanín 200, ${CENTRO}`,
    puntaje: 90,
  });
  // De otro organismo, con la prioridad más alta: no puede aparecer.
  ids.ajeno = await incidente(otroOrganismo.categoria, {
    primerReporteEn: '2026-01-06T10:00:00',
    puntaje: 100,
  });
});

afterAll(async () => {
  await prisma.informe.deleteMany({ where: { usuarioId: { in: usuarios } } });
  await prisma.registroIa.deleteMany({ where: { usuarioId: { in: usuarios } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
  await prisma.categoria.deleteMany({ where: { id: { in: [x.id, y.id, otroOrganismo.categoria.id] } } });
  await prisma.area.deleteMany({ where: { id: { in: [areaA.id, areaB.id, otroOrganismo.area.id] } } });
  await prisma.organismo.deleteMany({ where: { id: { in: [organismo.id, otroOrganismo.organismo.id] } } });
});

let consultar: ReturnType<typeof vi.spyOn<typeof servicioIa, 'consultar'>>;

beforeEach(() => {
  fetchSimulado.mockReset();
  consultar = vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pedir = (cuerpo: unknown, conToken: string | null = token) => {
  const pedido = request(app).post('/api/informes');
  return (conToken ? pedido.set('Authorization', `Bearer ${conToken}`) : pedido).send(cuerpo as object);
};

describe('POST /api/informes', () => {
  it('genera el informe, guarda exactamente las métricas que se mandaron a la IA y responde 201', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa([ids.atrasado!, ids.enero!, 999_999_999])));

    const res = await pedir(ENERO);

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const enviado = datosEnviados();
    const guardado = await prisma.informe.findUniqueOrThrow({ where: { id: res.body.informe.id } });
    expect(guardado.metricas).toEqual(enviado);
    expect(res.body.informe.metricas).toEqual(enviado);

    expect(res.body.informe).toMatchObject({
      desde: '2026-01-01',
      hasta: '2026-01-31',
      area: null,
      barrio: null,
      solicitante: { id: operadorId },
      registroIaId: guardado.registroIaId,
    });
    expect(guardado.periodoDesde.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(guardado.periodoHasta.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(guardado.areaId).toBeNull();
  });

  it('las métricas son las del organismo en el período, y los prioritarios incluyen lo atrasado', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa()));

    await pedir(ENERO);

    const datos = datosEnviados();
    expect(datos.filtros).toEqual({
      organismoId: organismo.id,
      organismo: organismo.nombre,
      areaId: null,
      area: null,
      barrio: null,
      desde: '2026-01-01',
      hasta: '2026-01-31',
    });
    // El de diciembre no cuenta en los abiertos de enero.
    expect(datos.abiertosPorEstado).toEqual([
      { estado: 'REGISTRADO', cantidad: 0 },
      { estado: 'VERIFICADO', cantidad: 1 },
      { estado: 'DERIVADO', cantidad: 1 },
      { estado: 'EN_EJECUCION', cantidad: 0 },
    ]);
    expect(datos.categoriasFrecuentes).toEqual([
      { id: x.id, nombre: x.nombre, nuevos: 2, abiertos: 1 },
      { id: y.id, nombre: y.nombre, nuevos: 1, abiertos: 1 },
    ]);
    expect(datos.tiempoDeResolucion.porCategoria).toEqual([
      { id: x.id, nombre: x.nombre, cantidad: 1, medianaDias: 12, promedioDias: 12 },
    ]);
    // Empatados: por nombre.
    expect(datos.barriosConMasAbiertos).toEqual([
      { barrio: BOUQUET, cantidad: 1 },
      { barrio: CENTRO, cantidad: 1 },
    ]);
    expect(datos.masPrioritarios.map((fila: { id: number }) => fila.id)).toEqual([
      ids.atrasado,
      ids.enero,
      ids.vereda,
    ]);
    expect(datos.masPrioritarios[0]).toMatchObject({
      categoria: x.nombre,
      area: areaA.nombre,
      estado: 'VERIFICADO',
      prioridad: 90,
      direccion: `Lanín 200, ${CENTRO}`,
      barrio: CENTRO,
      reportes: 0,
    });
  });

  it('el contenido tiene las secciones y el orden de intervención sin los ids inventados', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa([ids.atrasado!, 999_999_999, ids.enero!])));

    const res = await pedir(ENERO);

    const { contenido } = res.body.informe as { contenido: string };
    expect(contenido.match(/^## .+$/gm)).toEqual([
      '## Estado general',
      '## Zonas críticas',
      '## Categorías frecuentes',
      '## Demoras',
      '## Orden de intervención',
    ]);
    expect(contenido).toContain(
      `1. Incidente #${ids.atrasado}: ${x.nombre}, Lanín 200, ${CENTRO} (prioridad 90, `,
    );
    expect(contenido).toContain(`2. Incidente #${ids.enero}: `);
    expect(contenido).not.toContain('999999999');
  });

  it('le pide a la IA no inventar, con un plazo propio más largo y sin pensar mucho', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa()));

    await pedir(ENERO);

    expect(pedidoEnviado().system).toContain('No inventes datos');
    expect(pedidoEnviado().output_config.effort).toBe('low');
    expect(consultar.mock.calls[0]![0]).toMatchObject({
      tipo: 'INFORME',
      timeoutMs: env.IA_TIMEOUT_INFORME_MS,
    });
    expect(env.IA_TIMEOUT_INFORME_MS).toBeGreaterThan(env.IA_TIMEOUT_MS);
  });

  it('la llamada queda en registro_ia como INFORME, con quien lo pidió', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa()));

    const res = await pedir(ENERO);

    const registro = await prisma.registroIa.findUniqueOrThrow({
      where: { id: res.body.informe.registroIaId },
    });
    expect(registro).toMatchObject({ tipo: 'INFORME', usuarioId: operadorId, exito: true });
  });

  it('con un área, cubre solo esa área y la guarda en el informe', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa()));

    const res = await pedir({ ...ENERO, areaId: areaB.id });

    expect(res.status).toBe(201);
    expect(res.body.informe.area).toEqual({ id: areaB.id, nombre: areaB.nombre });
    const datos = datosEnviados();
    expect(datos.filtros).toMatchObject({ areaId: areaB.id, area: areaB.nombre });
    expect(datos.masPrioritarios.map((fila: { id: number }) => fila.id)).toEqual([ids.vereda]);
    expect(datos.categoriasFrecuentes.map((fila: { id: number }) => fila.id)).toEqual([y.id]);
  });

  it('con un barrio, cubre solo ese barrio y lo guarda en las métricas', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa()));

    const res = await pedir({ ...ENERO, barrio: `  ${CENTRO}  ` });

    expect(res.status).toBe(201);
    expect(res.body.informe.barrio).toBe(CENTRO);
    const datos = datosEnviados();
    expect(datos.filtros.barrio).toBe(CENTRO);
    expect(datos.barriosConMasAbiertos).toEqual([{ barrio: CENTRO, cantidad: 1 }]);
    expect(datos.masPrioritarios.map((fila: { id: number }) => fila.id)).toEqual([ids.atrasado, ids.enero]);
  });

  it('un administrador del organismo también puede', async () => {
    fetchSimulado.mockResolvedValueOnce(responder(informeIa()));

    const res = await pedir(ENERO, tokenAdmin);

    expect(res.status).toBe(201);
  });

  it('con la IA caída responde 503 con un mensaje claro y no guarda ningún informe', async () => {
    consultar.mockImplementation(servicioSimulado(undefined).consultar);
    const antes = await prisma.informe.count({ where: { usuarioId: operadorId } });

    const res = await pedir(ENERO);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ codigo: 'IA_NO_DISPONIBLE' });
    expect(res.body.error.mensaje).toMatch(/Probá de nuevo/);
    expect(await prisma.informe.count({ where: { usuarioId: operadorId } })).toBe(antes);
    const intento = await prisma.registroIa.findFirstOrThrow({
      where: { usuarioId: operadorId, tipo: 'INFORME' },
      orderBy: { id: 'desc' },
    });
    expect(intento.exito).toBe(false);
  });

  it('con una respuesta de la IA que no sirve, también 503 y sin guardar', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ estadoGeneral: 'Falta todo lo demás.' }));
    const antes = await prisma.informe.count({ where: { usuarioId: operadorId } });

    const res = await pedir(ENERO);

    expect(res.status).toBe(503);
    expect(await prisma.informe.count({ where: { usuarioId: operadorId } })).toBe(antes);
  });

  it.each([
    ['sin período', {}, 'desde'],
    ['hasta antes que desde', { desde: '2026-02-01', hasta: '2026-01-01' }, 'hasta'],
    ['más de un año', { desde: '2025-01-01', hasta: '2026-01-31' }, 'hasta'],
    ['con hora', { desde: '2026-01-01T10:00:00Z', hasta: '2026-01-31' }, 'desde'],
    ['antes del 2000', { desde: '1999-12-31', hasta: '2000-01-01' }, 'desde'],
    ['un id de área inválido', { ...ENERO, areaId: -1 }, 'areaId'],
  ])('%s: 400 sin llamar a la IA', async (_caso, cuerpo, campo) => {
    const res = await pedir(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(res.body.error.detalles.map((detalle: { campo: string }) => detalle.campo)).toContain(campo);
    expect(consultar).not.toHaveBeenCalled();
  });

  it('un área de otro organismo: 400', async () => {
    const res = await pedir({ ...ENERO, areaId: otroOrganismo.area.id });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'areaId', mensaje: 'No es un área de tu organismo' }]);
    expect(consultar).not.toHaveBeenCalled();
  });

  it('sin sesión 401, un vecino 403 y un administrador sin organismo 403 SIN_ORGANISMO', async () => {
    expect((await pedir(ENERO, null)).status).toBe(401);
    expect((await pedir(ENERO, tokenVecino)).status).toBe(403);
    const sinOrganismo = await pedir(ENERO, tokenSinOrganismo);
    expect(sinOrganismo.status).toBe(403);
    expect(sinOrganismo.body.error.codigo).toBe('SIN_ORGANISMO');
    expect(consultar).not.toHaveBeenCalled();
  });
});

describe('GET /api/informes y /api/informes/:id', () => {
  let propio: number;
  let ajeno: number;

  beforeAll(async () => {
    // Una respuesta nueva por pedido: el cuerpo de un Response se lee una sola vez.
    fetchSimulado.mockImplementation(async () => responder(informeIa()));
    vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
    propio = (await pedir({ ...ENERO, barrio: CENTRO })).body.informe.id;
    ajeno = (await pedir(ENERO, tokenOtro)).body.informe.id;
    vi.restoreAllMocks();
  });

  const listar = (conToken = token) =>
    request(app).get('/api/informes').set('Authorization', `Bearer ${conToken}`);

  it('el historial trae los del organismo, del más nuevo al más viejo, sin el contenido', async () => {
    const res = await listar();

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const listados = res.body.informes as { id: number }[];
    expect(listados.map((informe) => informe.id)).toContain(propio);
    expect(listados.map((informe) => informe.id)).not.toContain(ajeno);
    expect(listados[0]).toEqual({
      id: propio,
      desde: '2026-01-01',
      hasta: '2026-01-31',
      area: null,
      barrio: CENTRO,
      solicitante: { id: operadorId, nombre: expect.any(String) },
      creadoEn: expect.any(String),
    });
  });

  it('el otro organismo ve solo el suyo, y un administrador sin organismo, nada', async () => {
    const otro = await listar(tokenOtro);
    expect(otro.body.informes.map((informe: { id: number }) => informe.id)).toEqual([ajeno]);

    const sinOrganismo = await listar(tokenSinOrganismo);
    expect(sinOrganismo.body).toEqual({ informes: [] });
  });

  it('un informe completo, con su contenido y sus métricas', async () => {
    const res = await request(app)
      .get(`/api/informes/${propio}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.informe).toMatchObject({ id: propio, barrio: CENTRO });
    expect(res.body.informe.contenido).toMatch(/^## Estado general/);
    expect(res.body.informe.metricas.filtros.barrio).toBe(CENTRO);
  });

  it('el de otro organismo o uno que no existe: 404; un id inválido: 400', async () => {
    const pedirId = (id: string | number) =>
      request(app).get(`/api/informes/${id}`).set('Authorization', `Bearer ${token}`);

    expect((await pedirId(ajeno)).status).toBe(404);
    expect((await pedirId(999_999_999)).body.error.codigo).toBe('INFORME_NO_ENCONTRADO');
    expect((await pedirId('abc')).status).toBe(400);
  });

  it('un vecino no ve el historial', async () => {
    expect((await listar(tokenVecino)).status).toBe(403);
  });

  describe('GET /api/informes/:id/pdf', () => {
    const bajarPdf = (id: number | string, conToken: string | null = token) => {
      const pedido = request(app)
        .get(`/api/informes/${id}/pdf`)
        .buffer(true)
        .parse((res, listo) => {
          const partes: Buffer[] = [];
          res.on('data', (parte: Buffer) => partes.push(parte));
          res.on('end', () => listo(null, Buffer.concat(partes)));
        });
      return conToken ? pedido.set('Authorization', `Bearer ${conToken}`) : pedido;
    };

    it('descarga el PDF con el período en el nombre del archivo', async () => {
      const res = await bajarPdf(propio);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="informe-2026-01-01-al-2026-01-31.pdf"',
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    });

    it('el de otro organismo o uno que no existe: 404; sin sesión 401; un vecino 403', async () => {
      expect((await bajarPdf(ajeno)).status).toBe(404);
      expect((await bajarPdf(999_999_999)).status).toBe(404);
      expect((await bajarPdf(propio, null)).status).toBe(401);
      expect((await bajarPdf(propio, tokenVecino)).status).toBe(403);
    });
  });
});
