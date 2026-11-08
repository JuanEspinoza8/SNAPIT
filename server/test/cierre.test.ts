import type { Area, Categoria, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { compararCierre } from '../src/modulos/ia/compararCierre.js';
import { IaNoDisponible } from '../src/modulos/ia/servicio.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn } from './apoyo.js';
import { EXIF_DE_PRUEBA, jpegConExif, jpegSinExif } from './imagenes.js';

// La dirección no se consulta: no hace falta para cerrar.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));
// La comparación con la IA se simula: cada test decide qué responde. El resto del módulo queda como es.
vi.mock('../src/modulos/ia/compararCierre.js', async (original) => ({
  ...(await original<typeof import('../src/modulos/ia/compararCierre.js')>()),
  compararCierre: vi.fn(),
}));
const comparar = vi.mocked(compararCierre);

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;

beforeEach(async () => {
  ({ area, categoria } = await crearOrganismoDePrueba());
  operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });
  token = crearTokenAcceso(operador);
  comparar.mockReset();
});

const resuelto = (explicacion = 'El pozo está tapado.') =>
  comparar.mockResolvedValue({ veredicto: 'RESUELTO', explicacion, registroIaId: null as unknown as number });

/**
 * Un incidente en ejecución. Por defecto, en el punto del GPS de jpegConExif(): una foto del después con esa
 * imagen queda «en el lugar». Con `lejos`, a unos 1100 m.
 */
async function enEjecucion({ lejos = false } = {}) {
  const punto = { lat: EXIF_DE_PRUEBA.latitud + (lejos ? 0.01 : 0), lon: EXIF_DE_PRUEBA.longitud };
  const reporte = await reportarEn(punto, { categoriaId: categoria.id });
  vecinos.push(reporte.vecinoId);
  const id = reporte.incidenteId;
  const derivado = await request(app)
    .post(`/api/incidentes/${id}/derivacion`)
    .set('Authorization', `Bearer ${token}`)
    .send({ areaId: area.id });
  expect(derivado.status).toBe(200);
  const enCurso = await request(app)
    .post(`/api/incidentes/${id}/estado`)
    .set('Authorization', `Bearer ${token}`)
    .send({ estado: 'EN_EJECUCION' });
  expect(enCurso.status).toBe(200);
  return id;
}

const cerrar = (id: number, foto: Buffer | null = jpegConExif(), conToken = token) => {
  const pedido = request(app).post(`/api/incidentes/${id}/cierre`).set('Authorization', `Bearer ${conToken}`);
  return foto ? pedido.attach('foto', foto, 'despues.jpg') : pedido.field('nada', 'x');
};

const incidente = (id: number) =>
  prisma.incidente.findUniqueOrThrow({ where: { id }, select: { estado: true, resueltoEn: true } });

describe('POST /api/incidentes/:id/cierre', () => {
  it('con la foto en el lugar y la IA diciendo resuelto, valida el cierre y resuelve el incidente', async () => {
    const id = await enEjecucion();
    resuelto();

    const res = await cerrar(id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      incidente: { id, estado: 'RESUELTO' },
      cierre: {
        resultadoComparacion: 'VALIDADO',
        detalleComparacion: expect.stringContaining('El pozo está tapado.'),
        fotos: [{ id: expect.any(Number), url: expect.stringMatching(/^\/api\/fotos\/\d+$/) }],
      },
    });
    expect(res.body.cierre.distanciaMetros).toBeLessThan(1);
    expect(await incidente(id)).toMatchObject({ estado: 'RESUELTO', resueltoEn: expect.any(Date) });
    // A la IA le llegaron las fotos del antes (las del reporte) y la del después.
    expect(comparar).toHaveBeenCalledOnce();
    expect(comparar.mock.calls[0]![1]).toHaveLength(1);

    const movimiento = await prisma.movimientoIncidente.findFirstOrThrow({
      where: { incidenteId: id, tipo: 'CAMBIO_ESTADO', estadoNuevo: 'RESUELTO' },
    });
    expect(movimiento).toMatchObject({ estadoAnterior: 'EN_EJECUCION', usuarioId: operador.id });
  });

  it('la ficha pública muestra el después, y su foto se ve sin sesión', async () => {
    const id = await enEjecucion();
    resuelto();
    const fotoId = (await cerrar(id)).body.cierre.fotos[0].id as number;

    const ficha = await request(app).get(`/api/incidentes/${id}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.fotoCierre).toEqual({ id: fotoId, url: `/api/fotos/${fotoId}` });
    expect(ficha.body.resueltoEn).toEqual(expect.any(String));
    expect((await request(app).get(`/api/fotos/${fotoId}`)).status).toBe(200);
  });

  it('una foto lejos del incidente rechaza el cierre sin consultar a la IA, y el reintento corrige el mismo cierre', async () => {
    const id = await enEjecucion({ lejos: true });

    const rechazado = await cerrar(id);

    expect(rechazado.status).toBe(201);
    expect(rechazado.body.incidente.estado).toBe('EN_EJECUCION');
    expect(rechazado.body.cierre).toMatchObject({
      resultadoComparacion: 'RECHAZADO',
      detalleComparacion: expect.stringMatching(/a \d+ m del incidente, y el máximo es 50 m/),
    });
    expect(comparar).not.toHaveBeenCalled();
    // Lo rechazado no se publica: ni la ficha ni la foto sin sesión.
    const primeraFoto = rechazado.body.cierre.fotos[0].id as number;
    expect((await request(app).get(`/api/incidentes/${id}`)).body.fotoCierre).toBeNull();
    expect((await request(app).get(`/api/fotos/${primeraFoto}`)).status).toBe(404);

    // Se mueve el incidente al lugar de la foto (como si se hubiera corregido el punto) y se vuelve a intentar.
    await prisma.$executeRaw`
      UPDATE incidente
      SET ubicacion = ST_SetSRID(ST_MakePoint(${EXIF_DE_PRUEBA.longitud}, ${EXIF_DE_PRUEBA.latitud}), 4326)::geography
      WHERE id = ${id}`;
    resuelto();
    const validado = await cerrar(id);

    expect(validado.status).toBe(201);
    expect(validado.body.cierre.id).toBe(rechazado.body.cierre.id);
    expect(validado.body.cierre.resultadoComparacion).toBe('VALIDADO');
    // Ninguna foto se borra: la del intento rechazado sigue.
    expect(validado.body.cierre.fotos.map((foto: { id: number }) => foto.id)).toEqual([
      primeraFoto,
      expect.any(Number),
    ]);
    expect(await prisma.cierreIncidente.count({ where: { incidenteId: id } })).toBe(1);
    // El público ve solo la que lo cerró; el operador, también la rechazada.
    expect((await request(app).get(`/api/fotos/${primeraFoto}`)).status).toBe(404);
    const conSesion = await request(app)
      .get(`/api/fotos/${primeraFoto}`)
      .set('Authorization', `Bearer ${token}`);
    expect(conSesion.status).toBe(200);
  });

  it('una foto sin GPS deja el cierre observado sin consultar a la IA, y no se puede volver a cerrar', async () => {
    const id = await enEjecucion();

    const res = await cerrar(id, jpegSinExif());

    expect(res.status).toBe(201);
    expect(res.body.incidente.estado).toBe('EN_EJECUCION');
    expect(res.body.cierre).toMatchObject({
      resultadoComparacion: 'OBSERVADO',
      distanciaMetros: null,
      detalleComparacion: expect.stringContaining('no trae la ubicación'),
    });
    expect(comparar).not.toHaveBeenCalled();

    const otraVez = await cerrar(id);
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.codigo).toBe('CIERRE_OBSERVADO');
  });

  it('si la IA no está disponible, el cierre queda observado', async () => {
    const id = await enEjecucion();
    comparar.mockRejectedValue(new IaNoDisponible('La API tardó más de 30000 ms'));

    const res = await cerrar(id);

    expect(res.body.cierre).toMatchObject({
      resultadoComparacion: 'OBSERVADO',
      detalleComparacion: expect.stringContaining('la IA no está disponible'),
    });
    expect(res.body.incidente.estado).toBe('EN_EJECUCION');
  });

  it('si la IA dice que el problema sigue, rechaza el cierre', async () => {
    const id = await enEjecucion();
    comparar.mockResolvedValue({
      veredicto: 'NO_RESUELTO',
      explicacion: 'El pozo sigue abierto.',
      registroIaId: null as unknown as number,
    });

    const res = await cerrar(id);

    expect(res.body.cierre).toMatchObject({
      resultadoComparacion: 'RECHAZADO',
      detalleComparacion: expect.stringContaining('El pozo sigue abierto.'),
    });
    const movimiento = await prisma.movimientoIncidente.findFirstOrThrow({
      where: { incidenteId: id, tipo: 'COMENTARIO' },
      orderBy: { id: 'desc' },
    });
    expect(movimiento.comentario).toMatch(/^Cierre rechazado\./);
  });

  it('un incidente que no está en ejecución no se cierra: 409 y no guarda nada', async () => {
    const reporte = await reportarEn(
      { lat: EXIF_DE_PRUEBA.latitud, lon: EXIF_DE_PRUEBA.longitud },
      { categoriaId: categoria.id },
    );
    vecinos.push(reporte.vecinoId);

    const res = await cerrar(reporte.incidenteId);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INCIDENTE_NO_EN_EJECUCION');
    expect(await prisma.cierreIncidente.count({ where: { incidenteId: reporte.incidenteId } })).toBe(0);
  });

  it('solo el operador del organismo del incidente puede cerrarlo', async () => {
    const id = await enEjecucion();
    const otro = await crearOrganismoDePrueba();
    const ajeno = await crearUsuario({
      rol: 'OPERADOR',
      organismoId: otro.area.organismoId,
      areaId: otro.area.id,
    });
    const vecino = await crearUsuario({ rol: 'VECINO' });

    expect((await cerrar(id, jpegConExif(), crearTokenAcceso(ajeno))).status).toBe(403);
    expect((await cerrar(id, jpegConExif(), crearTokenAcceso(vecino))).status).toBe(403);
    expect((await request(app).post(`/api/incidentes/${id}/cierre`)).status).toBe(401);
    expect(await incidente(id)).toMatchObject({ estado: 'EN_EJECUCION' });
  });

  it('sin foto, o con un archivo que no es imagen: 400 en el campo foto', async () => {
    const id = await enEjecucion();

    const sinFoto = await cerrar(id, null);
    const noImagen = await cerrar(id, Buffer.from('no soy una imagen'));

    expect(sinFoto.status).toBe(400);
    expect(sinFoto.body.error.detalles).toEqual([{ campo: 'foto', mensaje: 'Es obligatoria' }]);
    expect(noImagen.status).toBe(400);
    expect(noImagen.body.error.detalles).toEqual([
      { campo: 'foto', mensaje: 'Tiene que ser una imagen JPG o PNG' },
    ]);
  });
});
