import type { Area, Categoria, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn, tokenDe } from './apoyo.js';

// La dirección no se consulta: no hace falta para la bandeja.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let otraArea: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;
// Cada test en su propio lugar, lejos de los puntos de interés de otros tests: el contexto urbano suma 0.
let lat: number;
const lon = -68.4;

beforeEach(async () => {
  ({ area, categoria } = await crearOrganismoDePrueba());
  otraArea = await prisma.area.create({ data: { organismoId: area.organismoId, nombre: 'Otra área' } });
  operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });
  token = crearTokenAcceso(operador);
  lat = -38.9 - Math.random() * 0.2;
});

/** Un reporte en la cuadra `cuadra` del lugar del test (cada una a unos 110 m: no se agrupan entre sí). */
async function reportar(
  cuadra: number,
  opciones: Partial<Parameters<typeof reportarEn>[1]> = {},
  enCategoria = categoria,
) {
  const reporte = await reportarEn(
    { lat: lat - cuadra * 0.001, lon },
    { categoriaId: enCategoria.id, ...opciones },
  );
  vecinos.push(reporte.vecinoId);
  return reporte;
}

const bandeja = (consulta = '', conToken = token) =>
  request(app).get(`/api/bandeja${consulta}`).set('Authorization', `Bearer ${conToken}`);

const gestion = (id: number, conToken = token) =>
  request(app).get(`/api/incidentes/${id}/gestion`).set('Authorization', `Bearer ${conToken}`);

/**
 * Deja el incidente derivado a esa área directo en la base, con su movimiento: la bandeja no depende de
 * POST /derivacion (#65).
 */
async function derivar(id: number, a: Area, comentario = `Derivado a ${a.nombre}`) {
  await prisma.incidente.update({ where: { id }, data: { areaId: a.id, estado: 'DERIVADO' } });
  await prisma.movimientoIncidente.create({
    data: {
      incidenteId: id,
      usuarioId: operador.id,
      tipo: 'DERIVACION',
      areaId: a.id,
      estadoAnterior: 'VERIFICADO',
      estadoNuevo: 'DERIVADO',
      comentario,
    },
  });
}

const idsDe = (res: request.Response) => res.body.incidentes.map((i: { id: number }) => i.id);

describe('GET /api/bandeja', () => {
  it('sin sesión responde 401 y un vecino recibe 403', async () => {
    expect((await request(app).get('/api/bandeja')).status).toBe(401);
    const res = await bandeja('', await tokenDe('VECINO'));
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('ordena por prioridad, con los motivos, y la prioridad manual manda', async () => {
    const grave = (await reportar(0, { severidad: 'GRAVE' })).incidenteId;
    const leve = (await reportar(1, { severidad: 'LEVE' })).incidenteId;
    const moderada = (await reportar(2, { severidad: 'MODERADA' })).incidenteId;

    let res = await bandeja();
    expect(res.status).toBe(200);
    // Severidad con peso 1: 40, 26,7 y 13,3, más 6,25 de un reporte cada uno.
    expect(idsDe(res)).toEqual([grave, moderada, leve]);
    expect(res.body.incidentes[0]).toEqual({
      id: grave,
      estado: 'VERIFICADO',
      categoria: { id: categoria.id, nombre: categoria.nombre },
      area: { id: area.id, nombre: area.nombre },
      direccion: null,
      cantidadReportes: 1,
      primerReporteEn: expect.any(String),
      puntajePrioridad: 46.25,
      prioridadManual: null,
      motivos: [
        { factor: 'SEVERIDAD', valor: 40, detalle: expect.stringContaining('+40') },
        { factor: 'EVIDENCIAS', valor: 6.25, detalle: 'Lo reportaron 1 vez: +6,3' },
        { factor: 'ANTIGUEDAD', valor: 0, detalle: 'Lleva menos de un día sin resolverse: +0' },
        { factor: 'CONTEXTO_URBANO', valor: 0, detalle: expect.stringContaining('+0') },
      ],
    });

    const ajuste = await request(app)
      .put(`/api/incidentes/${leve}/prioridad-manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({ valor: 80, motivo: 'Frente a la escuela' });
    expect(ajuste.status).toBe(200);

    res = await bandeja();
    expect(idsDe(res)).toEqual([leve, grave, moderada]);
    expect(res.body.incidentes[0]).toMatchObject({ puntajePrioridad: 19.58, prioridadManual: 80 });
    expect(res.body.incidentes[0].motivos.at(-1)).toMatchObject({ factor: 'AJUSTE_MANUAL', valor: 60.42 });
  });

  it('no trae incidentes en revisión, unidos, caducados, vencidos, desestimados, resueltos ni de otro organismo', async () => {
    const queda = (await reportar(0)).incidenteId;
    await reportar(1, { pendiente: true });
    const unido = (await reportar(2)).incidenteId;
    const caducado = (await reportar(3)).incidenteId;
    const vencido = (await reportar(4)).incidenteId;
    const desestimado = (await reportar(5)).incidenteId;
    const resuelto = (await reportar(6)).incidenteId;
    const otro = await crearOrganismoDePrueba();
    const deOtroOrganismo = (await reportar(7, {}, otro.categoria)).incidenteId;

    const union = await request(app)
      .post(`/api/incidentes/${unido}/union`)
      .set('Authorization', `Bearer ${token}`)
      .send({ principalId: queda });
    expect(union.status).toBe(200);
    await prisma.incidente.update({ where: { id: caducado }, data: { caducadoEn: new Date() } });
    await prisma.incidente.update({
      where: { id: vencido },
      data: { tipoVigencia: 'TEMPORAL', vigenteHasta: new Date(Date.now() - 60_000) },
    });
    await prisma.incidente.update({ where: { id: desestimado }, data: { estado: 'DESESTIMADO' } });
    await prisma.incidente.update({
      where: { id: resuelto },
      data: { estado: 'RESUELTO', resueltoEn: new Date() },
    });

    const res = await bandeja('?areaId=todas');
    expect(res.status).toBe(200);
    expect(idsDe(res)).toEqual([queda]);
    expect(idsDe(res)).not.toContain(deOtroOrganismo);
  });

  it('por defecto muestra el área del operador; se puede pedir otra o todas', async () => {
    const enSuArea = (await reportar(0, { severidad: 'GRAVE' })).incidenteId;
    const derivado = (await reportar(1)).incidenteId;
    await derivar(derivado, otraArea);

    expect(idsDe(await bandeja())).toEqual([enSuArea]);
    expect(idsDe(await bandeja(`?areaId=${otraArea.id}`))).toEqual([derivado]);
    const todas = await bandeja('?areaId=todas');
    expect(idsDe(todas)).toEqual([enSuArea, derivado]);
    expect(todas.body.incidentes[1]).toMatchObject({
      estado: 'DERIVADO',
      area: { id: otraArea.id, nombre: 'Otra área' },
    });

    // Un administrador sin área ve todo su organismo; uno sin organismo, nada.
    const admin = await crearUsuario({ rol: 'ADMINISTRADOR', organismoId: area.organismoId });
    expect(idsDe(await bandeja('', crearTokenAcceso(admin)))).toEqual([enSuArea, derivado]);
    const res = await bandeja('', await tokenDe('ADMINISTRADOR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ incidentes: [] });
  });

  it('filtra por estado y por categoría', async () => {
    const otraCategoria = await prisma.categoria.create({
      data: { nombre: `Otra categoría ${Math.random()}`, areaId: area.id },
    });
    const verificado = (await reportar(0)).incidenteId;
    const derivado = (await reportar(1)).incidenteId;
    const deOtraCategoria = (await reportar(2, {}, otraCategoria)).incidenteId;
    await derivar(derivado, area);

    expect(idsDe(await bandeja('?estado=DERIVADO'))).toEqual([derivado]);
    expect(idsDe(await bandeja('?estado=VERIFICADO')).sort()).toEqual([verificado, deOtraCategoria].sort());
    expect(idsDe(await bandeja(`?categoriaId=${otraCategoria.id}`))).toEqual([deOtraCategoria]);
  });

  it('rechaza filtros inválidos y un área de otro organismo', async () => {
    const otro = await crearOrganismoDePrueba();
    const casos: [string, string, string][] = [
      ['?estado=REGISTRADO', 'estado', 'Tiene que ser VERIFICADO, DERIVADO, EN_EJECUCION'],
      ['?areaId=abc', 'areaId', 'Tiene que ser el id de un área o "todas"'],
      ['?categoriaId=0', 'categoriaId', 'No es un id válido'],
      [`?areaId=${otro.area.id}`, 'areaId', 'No es un área de tu organismo'],
    ];
    for (const [consulta, campo, mensaje] of casos) {
      const res = await bandeja(consulta);
      expect(res.status, consulta).toBe(400);
      expect(res.body.error.detalles, consulta).toEqual([{ campo, mensaje }]);
    }
  });
});

describe('GET /api/incidentes/:id/gestion', () => {
  it('trae los reportes con su confianza y señales, la bitácora, la prioridad y el cierre', async () => {
    const reporte = await reportar(0, { severidad: 'GRAVE' });
    const id = reporte.incidenteId;
    await derivar(id, otraArea, 'Derivado a Otra área: Lo atiende la cuadrilla');

    const res = await gestion(id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      estado: 'DERIVADO',
      categoria: { id: categoria.id, nombre: categoria.nombre },
      area: { id: otraArea.id, nombre: 'Otra área' },
      severidad: 'GRAVE',
      tipoVigencia: 'PERMANENTE',
      vigenteHasta: null,
      caducadoEn: null,
      resueltoEn: null,
      cantidadReportes: 1,
      incidentePrincipalId: null,
      unidos: [],
      prioridad: { puntajePrioridad: 46.25, prioridadManual: null, ajustadaPor: null },
      cierre: null,
    });
    expect(res.body.lat).toBeCloseTo(lat, 5);
    expect(res.body.prioridad.factores.map((f: { factor: string }) => f.factor)).toEqual([
      'SEVERIDAD',
      'EVIDENCIAS',
      'ANTIGUEDAD',
      'CONTEXTO_URBANO',
    ]);

    expect(res.body.reportes).toHaveLength(1);
    const [fila] = res.body.reportes;
    expect(fila).toMatchObject({
      id: reporte.id,
      incidenteId: id,
      categoria: { id: categoria.id, nombre: categoria.nombre },
      severidadDeclarada: 'GRAVE',
      origen: 'APP_MOVIL',
      nivelConfianza: 65,
      estadoVerificacion: 'VERIFICADO',
    });
    expect(fila.senales).toContainEqual({
      tipo: 'ORIGEN_APP',
      valor: 15,
      detalle: expect.any(String),
    });
    expect(fila.fotos).toHaveLength(1);
    expect(fila.fotos[0].url).toBe(`/api/fotos/${fila.fotos[0].id}`);
    // La foto se baja con la sesión del operador (#49).
    const foto = await request(app).get(fila.fotos[0].url).set('Authorization', `Bearer ${token}`);
    expect(foto.status).toBe(200);

    // La verificación automática y la derivación, con su autor.
    expect(res.body.bitacora).toEqual([
      expect.objectContaining({ tipo: 'CAMBIO_ESTADO', usuario: null, estadoNuevo: 'VERIFICADO' }),
      {
        id: expect.any(Number),
        tipo: 'DERIVACION',
        usuario: { id: operador.id, nombre: operador.nombre },
        area: { id: otraArea.id, nombre: 'Otra área' },
        estadoAnterior: 'VERIFICADO',
        estadoNuevo: 'DERIVADO',
        comentario: 'Derivado a Otra área: Lo atiende la cuadrilla',
        incidenteRelacionadoId: null,
        creadoEn: expect.any(String),
      },
    ]);
  });

  it('muestra el cierre con su foto, si lo hay', async () => {
    const { id: reporteId, incidenteId: id } = await reportar(0);
    const cierre = await prisma.cierreIncidente.create({
      data: {
        incidenteId: id,
        usuarioId: operador.id,
        distanciaMetros: '12.50',
        resultadoComparacion: 'OBSERVADO',
        detalleComparacion: 'La foto no es concluyente',
      },
    });
    const ruta = (await prisma.fotografia.findFirstOrThrow({ where: { reporteId } })).rutaArchivo;
    const foto = await prisma.fotografia.create({ data: { cierreId: cierre.id, rutaArchivo: ruta } });

    const res = await gestion(id);

    expect(res.body.cierre).toEqual({
      id: cierre.id,
      resultadoComparacion: 'OBSERVADO',
      distanciaMetros: 12.5,
      detalleComparacion: 'La foto no es concluyente',
      creadoEn: expect.any(String),
      usuario: { id: operador.id, nombre: operador.nombre },
      fotos: [{ id: foto.id, url: `/api/fotos/${foto.id}` }],
    });
    // La foto del cierre comparte el archivo con la del reporte: se borra solo la fila.
    await prisma.fotografia.delete({ where: { id: foto.id } });
  });

  it('el principal muestra los reportes de sus unidos y los desestimados; el unido se muestra a sí mismo', async () => {
    const principal = await reportar(0);
    const pendiente = await reportar(0, { pendiente: true });
    expect(pendiente.incidenteId).toBe(principal.incidenteId);
    const duplicado = await reportar(1);
    await request(app)
      .post(`/api/reportes/${pendiente.id}/revision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'DESESTIMADO', comentario: 'Foto de otro lugar' });
    const union = await request(app)
      .post(`/api/incidentes/${duplicado.incidenteId}/union`)
      .set('Authorization', `Bearer ${token}`)
      .send({ principalId: principal.incidenteId });
    expect(union.status).toBe(200);

    const delPrincipal = await gestion(principal.incidenteId);
    expect(delPrincipal.body.unidos).toEqual([{ id: duplicado.incidenteId, estado: 'VERIFICADO' }]);
    expect(
      delPrincipal.body.reportes.map((r: { id: number; incidenteId: number; estadoVerificacion: string }) => [
        r.id,
        r.incidenteId,
        r.estadoVerificacion,
      ]),
    ).toEqual([
      [principal.id, principal.incidenteId, 'VERIFICADO'],
      [pendiente.id, principal.incidenteId, 'DESESTIMADO'],
      [duplicado.id, duplicado.incidenteId, 'VERIFICADO'],
    ]);

    const delDuplicado = await gestion(duplicado.incidenteId);
    expect(delDuplicado.status).toBe(200);
    expect(delDuplicado.body).toMatchObject({
      id: duplicado.incidenteId,
      incidentePrincipalId: principal.incidenteId,
      unidos: [],
    });
    expect(delDuplicado.body.reportes.map((r: { id: number }) => r.id)).toEqual([duplicado.id]);
    expect(delDuplicado.body.bitacora.at(-1)).toMatchObject({
      tipo: 'FUSION',
      incidenteRelacionadoId: principal.incidenteId,
    });
  });

  it('un incidente de otro organismo da 403, uno que no existe 404, y un vecino no entra', async () => {
    const otro = await crearOrganismoDePrueba();
    const ajeno = (await reportar(0, {}, otro.categoria)).incidenteId;

    const res = await gestion(ajeno);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
    expect((await gestion(ajeno, await tokenDe('ADMINISTRADOR'))).status).toBe(403);
    expect((await gestion(2_000_000_000)).body.error.codigo).toBe('INCIDENTE_NO_ENCONTRADO');
    expect((await gestion(ajeno, await tokenDe('VECINO'))).status).toBe(403);
    expect((await request(app).get(`/api/incidentes/${ajeno}/gestion`)).status).toBe(401);
  });
});
