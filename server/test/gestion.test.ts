import type { Area, Categoria, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { alCambiarIncidente } from '../src/modulos/incidentes/eventos.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn, tokenDe } from './apoyo.js';

// La dirección no se consulta: no hace falta para la gestión.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let otraArea: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;
let lat: number;
const lon = -68.4;

// Cada aviso a la prioridad (alCambiarIncidente), para ver que las acciones la recalculan.
const avisos = vi.fn();
let bajaAvisos: () => void;

beforeEach(async () => {
  ({ area, categoria } = await crearOrganismoDePrueba());
  otraArea = await prisma.area.create({ data: { organismoId: area.organismoId, nombre: 'Veredas' } });
  operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });
  token = crearTokenAcceso(operador);
  lat = -38.9 - Math.random() * 0.2;
  avisos.mockClear();
  bajaAvisos = alCambiarIncidente(async (_tx, id) => avisos(id));
});

afterEach(() => bajaAvisos());

/** Un incidente VERIFICADO (o REGISTRADO, con `pendiente`) en la cuadra `cuadra` del lugar del test. */
async function incidente(cuadra = 0, pendiente = false, enCategoria = categoria) {
  const reporte = await reportarEn(
    { lat: lat - cuadra * 0.001, lon },
    { categoriaId: enCategoria.id, pendiente },
  );
  vecinos.push(reporte.vecinoId);
  return reporte.incidenteId;
}

const derivar = (id: number, cuerpo: object, conToken = token) =>
  request(app)
    .post(`/api/incidentes/${id}/derivacion`)
    .set('Authorization', `Bearer ${conToken}`)
    .send(cuerpo);

const cambiarEstado = (id: number, cuerpo: object, conToken = token) =>
  request(app).post(`/api/incidentes/${id}/estado`).set('Authorization', `Bearer ${conToken}`).send(cuerpo);

const comentar = (id: number, cuerpo: object, conToken = token) =>
  request(app)
    .post(`/api/incidentes/${id}/comentarios`)
    .set('Authorization', `Bearer ${conToken}`)
    .send(cuerpo);

const leer = (id: number) =>
  prisma.incidente.findUniqueOrThrow({ where: { id }, select: { estado: true, areaId: true } });

const bitacora = (id: number) =>
  prisma.movimientoIncidente.findMany({ where: { incidenteId: id }, orderBy: { id: 'asc' } });

/** Un incidente ya derivado al área del operador. */
async function derivado(cuadra = 0) {
  const id = await incidente(cuadra);
  expect((await derivar(id, { areaId: area.id })).status).toBe(200);
  return id;
}

describe('POST /api/incidentes/:id/derivacion', () => {
  it('deriva un incidente verificado a un área de su organismo y deja el movimiento', async () => {
    const id = await incidente();
    avisos.mockClear();

    const res = await derivar(id, { areaId: otraArea.id, comentario: '  es de veredas  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      estado: 'DERIVADO',
      area: { id: otraArea.id, nombre: 'Veredas' },
      movimiento: {
        id: expect.any(Number),
        tipo: 'DERIVACION',
        usuario: { id: operador.id, nombre: operador.nombre },
        area: { id: otraArea.id, nombre: 'Veredas' },
        estadoAnterior: 'VERIFICADO',
        estadoNuevo: 'DERIVADO',
        comentario: 'Derivado a Veredas: es de veredas',
        incidenteRelacionadoId: null,
        creadoEn: expect.any(String),
      },
    });
    expect(await leer(id)).toEqual({ estado: 'DERIVADO', areaId: otraArea.id });
    expect(avisos).toHaveBeenCalledWith(id);
  });

  it('se puede re-derivar a otra área, pero no a la misma', async () => {
    const id = await derivado();

    const res = await derivar(id, { areaId: otraArea.id });
    expect(res.status).toBe(200);
    expect(res.body.movimiento).toMatchObject({
      estadoAnterior: 'DERIVADO',
      estadoNuevo: 'DERIVADO',
      comentario: `Derivado de ${area.nombre} a Veredas`,
    });

    const otraVez = await derivar(id, { areaId: otraArea.id });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.codigo).toBe('MISMA_AREA');
  });

  it('un área inactiva, de otro organismo o que no existe da 400', async () => {
    const id = await incidente();
    const inactiva = await prisma.area.create({
      data: { organismoId: area.organismoId, nombre: 'Cerrada', activa: false },
    });
    const ajena = (await crearOrganismoDePrueba()).area;

    const casos: [object, string][] = [
      [{ areaId: inactiva.id }, 'El área no está activa'],
      [{ areaId: ajena.id }, 'No es un área de tu organismo'],
      [{ areaId: 2_000_000_000 }, 'No es un área de tu organismo'],
      [{}, 'Tiene que ser un número'],
    ];
    for (const [cuerpo, mensaje] of casos) {
      const res = await derivar(id, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
      expect(res.body.error.detalles).toEqual([{ campo: 'areaId', mensaje }]);
    }
    expect(await leer(id)).toEqual({ estado: 'VERIFICADO', areaId: null });
    expect(await bitacora(id)).toHaveLength(1);
  });

  it('no deriva uno en revisión ni uno en ejecución', async () => {
    const registrado = await incidente(0, true);
    let res = await derivar(registrado, { areaId: area.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      codigo: 'TRANSICION_INVALIDA',
      mensaje: 'Un incidente REGISTRADO no puede pasar a DERIVADO',
    });

    const enEjecucion = await derivado(1);
    expect((await cambiarEstado(enEjecucion, { estado: 'EN_EJECUCION' })).status).toBe(200);
    res = await derivar(enEjecucion, { areaId: otraArea.id });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('no deriva uno unido a otro ni uno caducado', async () => {
    const principal = await incidente(0);
    const unido = await incidente(1);
    await request(app)
      .post(`/api/incidentes/${unido}/union`)
      .set('Authorization', `Bearer ${token}`)
      .send({ principalId: principal });
    const caducado = await incidente(2);
    await prisma.incidente.update({ where: { id: caducado }, data: { caducadoEn: new Date() } });

    expect((await derivar(unido, { areaId: area.id })).body.error.codigo).toBe('INCIDENTE_UNIDO');
    expect((await derivar(caducado, { areaId: area.id })).body.error.codigo).toBe('INCIDENTE_CADUCADO');
  });

  it('otro organismo da 403, uno que no existe 404 y sin sesión 401', async () => {
    const otro = await crearOrganismoDePrueba();
    const ajeno = await incidente(0, false, otro.categoria);

    expect((await derivar(ajeno, { areaId: otro.area.id })).status).toBe(403);
    expect((await derivar(2_000_000_000, { areaId: area.id })).status).toBe(404);
    expect((await derivar(ajeno, { areaId: area.id }, await tokenDe('VECINO'))).status).toBe(403);
    expect((await request(app).post(`/api/incidentes/${ajeno}/derivacion`).send({})).status).toBe(401);
  });
});

describe('POST /api/incidentes/:id/estado', () => {
  it('pasa un derivado a EN_EJECUCION, con el comentario opcional', async () => {
    const id = await derivado();
    avisos.mockClear();

    const res = await cambiarEstado(id, { estado: 'EN_EJECUCION' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      estado: 'EN_EJECUCION',
      movimiento: {
        tipo: 'CAMBIO_ESTADO',
        usuario: { id: operador.id },
        area: null,
        estadoAnterior: 'DERIVADO',
        estadoNuevo: 'EN_EJECUCION',
        comentario: 'Pasó a ejecución',
      },
    });
    expect((await leer(id)).estado).toBe('EN_EJECUCION');
    expect(avisos).toHaveBeenCalledWith(id);
  });

  it('para pasar a ejecución primero hay que derivar', async () => {
    const id = await incidente();
    const res = await cambiarEstado(id, { estado: 'EN_EJECUCION' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('Un incidente VERIFICADO no puede pasar a EN_EJECUCION');
  });

  it('desestimar exige un motivo; el incidente sale del mapa y sus reportes no cambian', async () => {
    const id = await derivado();
    const reporte = await prisma.reporte.findFirstOrThrow({
      where: { incidenteId: id },
      select: { id: true, estadoVerificacion: true, usuario: { select: { reputacion: true } } },
    });

    for (const cuerpo of [{ estado: 'DESESTIMADO' }, { estado: 'DESESTIMADO', comentario: '   ' }]) {
      const sinMotivo = await cambiarEstado(id, cuerpo);
      expect(sinMotivo.status).toBe(400);
      expect(sinMotivo.body.error.detalles).toEqual([
        { campo: 'comentario', mensaje: 'Es obligatorio para desestimar' },
      ]);
    }

    const res = await cambiarEstado(id, { estado: 'DESESTIMADO', comentario: 'Ya estaba arreglado' });
    expect(res.status).toBe(200);
    expect(res.body.movimiento).toMatchObject({
      estadoAnterior: 'DERIVADO',
      estadoNuevo: 'DESESTIMADO',
      comentario: 'Desestimado: Ya estaba arreglado',
    });

    // Sale del mapa (nota del 10/10): la ficha pública y sus fotos dan 404.
    expect((await request(app).get(`/api/incidentes/${id}`)).status).toBe(404);
    const foto = await prisma.fotografia.findFirstOrThrow({ where: { reporteId: reporte.id } });
    expect((await request(app).get(`/api/fotos/${foto.id}`)).status).toBe(404);
    // Reporte ≠ incidente: el reporte sigue verificado y la reputación del vecino no cambia.
    expect(
      await prisma.reporte.findUniqueOrThrow({
        where: { id: reporte.id },
        select: { id: true, estadoVerificacion: true, usuario: { select: { reputacion: true } } },
      }),
    ).toEqual(reporte);
  });

  it('se puede desestimar un verificado y uno en ejecución', async () => {
    const verificado = await incidente(0);
    const enEjecucion = await derivado(1);
    await cambiarEstado(enEjecucion, { estado: 'EN_EJECUCION' });

    for (const id of [verificado, enEjecucion]) {
      const res = await cambiarEstado(id, { estado: 'DESESTIMADO', comentario: 'Duplicado de un reclamo' });
      expect(res.status).toBe(200);
    }
  });

  it('un desestimado no sale de su estado', async () => {
    const id = await incidente();
    await cambiarEstado(id, { estado: 'DESESTIMADO', comentario: 'No es un problema de la vía pública' });

    for (const estado of ['EN_EJECUCION', 'DESESTIMADO']) {
      const res = await cambiarEstado(id, { estado, comentario: 'otra vez' });
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('TRANSICION_INVALIDA');
    }
    const otraDerivacion = await derivar(id, { areaId: area.id });
    expect(otraDerivacion.body.error.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('no acepta otros estados: a RESUELTO se llega por el cierre y derivar tiene su ruta', async () => {
    const id = await derivado();
    await cambiarEstado(id, { estado: 'EN_EJECUCION' });

    for (const estado of ['RESUELTO', 'DERIVADO', 'VERIFICADO', 'REGISTRADO', undefined]) {
      const res = await cambiarEstado(id, { estado, comentario: 'listo' });
      expect(res.status, String(estado)).toBe(400);
      expect(res.body.error.detalles).toEqual([
        { campo: 'estado', mensaje: 'Tiene que ser EN_EJECUCION o DESESTIMADO' },
      ]);
    }
    expect((await leer(id)).estado).toBe('EN_EJECUCION');
  });

  it('otro organismo da 403', async () => {
    const otro = await crearOrganismoDePrueba();
    const ajeno = await incidente(0, false, otro.categoria);
    const res = await cambiarEstado(ajeno, { estado: 'DESESTIMADO', comentario: 'no' });
    expect(res.status).toBe(403);
    expect((await leer(ajeno)).estado).toBe('VERIFICADO');
  });
});

describe('POST /api/incidentes/:id/comentarios', () => {
  it('agrega un comentario a la bitácora sin cambiar el incidente ni recalcular', async () => {
    const id = await incidente();
    avisos.mockClear();

    const res = await comentar(id, { comentario: '  La cuadrilla pasa el lunes  ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id,
      movimiento: {
        id: expect.any(Number),
        tipo: 'COMENTARIO',
        usuario: { id: operador.id, nombre: operador.nombre },
        area: null,
        estadoAnterior: null,
        estadoNuevo: null,
        comentario: 'La cuadrilla pasa el lunes',
        incidenteRelacionadoId: null,
        creadoEn: expect.any(String),
      },
    });
    expect(await leer(id)).toEqual({ estado: 'VERIFICADO', areaId: null });
    expect(avisos).not.toHaveBeenCalled();
  });

  it('el comentario es obligatorio y tiene hasta 1000 caracteres', async () => {
    const id = await incidente();
    const casos: [object, string][] = [
      [{}, 'Es obligatorio'],
      [{ comentario: '   ' }, 'Es obligatorio'],
      [{ comentario: 'x'.repeat(1001) }, 'Tiene que tener hasta 1000 caracteres'],
    ];
    for (const [cuerpo, mensaje] of casos) {
      const res = await comentar(id, cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.error.detalles).toEqual([{ campo: 'comentario', mensaje }]);
    }
  });

  it('se puede comentar un incidente cerrado o unido, pero no uno de otro organismo', async () => {
    const desestimado = await incidente(0);
    await cambiarEstado(desestimado, { estado: 'DESESTIMADO', comentario: 'Duplicado' });
    const principal = await incidente(1);
    const unido = await incidente(2);
    await request(app)
      .post(`/api/incidentes/${unido}/union`)
      .set('Authorization', `Bearer ${token}`)
      .send({ principalId: principal });

    expect((await comentar(desestimado, { comentario: 'Se reabrió el reclamo por teléfono' })).status).toBe(
      201,
    );
    expect((await comentar(unido, { comentario: 'Es el mismo pozo' })).status).toBe(201);

    const otro = await crearOrganismoDePrueba();
    const ajeno = await incidente(3, false, otro.categoria);
    expect((await comentar(ajeno, { comentario: 'hola' })).status).toBe(403);
  });
});

describe('La bitácora', () => {
  it('solo crece: cada acción agrega una fila y las anteriores quedan iguales', async () => {
    const id = await incidente();
    const antes = await bitacora(id);

    await derivar(id, { areaId: area.id });
    await comentar(id, { comentario: 'Pedido de materiales' });
    await derivar(id, { areaId: otraArea.id });
    await cambiarEstado(id, { estado: 'EN_EJECUCION', comentario: 'Arrancó la obra' });
    await cambiarEstado(id, { estado: 'DESESTIMADO', comentario: 'Lo arregló un vecino' });
    // Una acción rechazada no deja nada.
    expect((await cambiarEstado(id, { estado: 'EN_EJECUCION' })).status).toBe(409);

    const despues = await bitacora(id);
    expect(despues).toHaveLength(antes.length + 5);
    expect(despues.slice(0, antes.length)).toEqual(antes);
    expect(despues.slice(antes.length).map((m) => [m.tipo, m.usuarioId, m.estadoNuevo])).toEqual([
      ['DERIVACION', operador.id, 'DERIVADO'],
      ['COMENTARIO', operador.id, null],
      ['DERIVACION', operador.id, 'DERIVADO'],
      ['CAMBIO_ESTADO', operador.id, 'EN_EJECUCION'],
      ['CAMBIO_ESTADO', operador.id, 'DESESTIMADO'],
    ]);
  });

  it('no hay rutas para editar ni borrar movimientos', async () => {
    const id = await incidente();
    const [movimiento] = await bitacora(id);
    for (const metodo of ['put', 'patch', 'delete'] as const) {
      const res = await request(app)
        [metodo](`/api/incidentes/${id}/comentarios/${movimiento!.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ comentario: 'cambiado' });
      expect(res.status).toBe(404);
    }
    expect(await bitacora(id)).toEqual([movimiento]);
  });
});
