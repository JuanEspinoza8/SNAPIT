import { randomUUID } from 'node:crypto';
import type { Area, Categoria, EstadoIncidente } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import {
  borrarReportesDe,
  crearIncidente,
  crearOrganismoDePrueba,
  crearUsuario,
  diasVigenciaPorDefecto,
  reportarEn,
  tokenDe,
} from './apoyo.js';

// La dirección no se consulta: no hace falta para confirmar.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const DIA_MS = 24 * 60 * 60 * 1000;

let area: Area;
let categoria: Categoria;
/** Una obra: temporal, vence a los 10 días. */
let obra: Categoria;
/** Temporal sin días propios: vence a los de vigencia.dias_default. */
let sinDias: Categoria;
const incidentes: number[] = [];
const vecinos: number[] = [];

beforeAll(async () => {
  ({ area, categoria } = await crearOrganismoDePrueba());
  const temporal = (diasCaducidadDefault: number | null) =>
    prisma.categoria.create({
      data: {
        nombre: `Obra ${randomUUID()}`,
        areaId: area.id,
        tipoVigenciaDefault: 'TEMPORAL',
        diasCaducidadDefault,
      },
    });
  obra = await temporal(10);
  sinDias = await temporal(null);
});

afterAll(async () => {
  // Las confirmaciones se van con su incidente. Primero los duplicados: el principal no se puede borrar
  // mientras otro apunta a él.
  await prisma.incidente.deleteMany({
    where: { id: { in: incidentes }, incidentePrincipalId: { not: null } },
  });
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
  await borrarReportesDe(vecinos);
});

async function incidente(
  opciones: Parameters<typeof crearIncidente>[1] & { categoriaId?: number; vigenteHasta?: Date } = {},
) {
  const { categoriaId = categoria.id, vigenteHasta, ...resto } = opciones;
  const id = await crearIncidente(categoriaId, resto);
  incidentes.push(id);
  if (vigenteHasta) {
    await prisma.incidente.update({ where: { id }, data: { tipoVigencia: 'TEMPORAL', vigenteHasta } });
  }
  return id;
}

async function vecino() {
  const usuario = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(usuario.id);
  return { id: usuario.id, ...conToken(crearTokenAcceso(usuario)) };
}

function conToken(token?: string) {
  const conSesion = (pedido: request.Test) =>
    token ? pedido.set('Authorization', `Bearer ${token}`) : pedido;
  return {
    confirmar: (id: number) => conSesion(request(app).post(`/api/incidentes/${id}/confirmaciones`)),
    consultar: (id: number) => conSesion(request(app).get(`/api/incidentes/${id}/confirmacion`)),
  };
}

const confirmacionesDe = (usuarioId: number) =>
  prisma.confirmacionIncidente.findMany({ where: { usuarioId }, select: { incidenteId: true } });

const vigenciaDe = (id: number) =>
  prisma.incidente.findUniqueOrThrow({ where: { id }, select: { tipoVigencia: true, vigenteHasta: true } });

describe('POST /api/incidentes/:id/confirmaciones', () => {
  it('guarda la confirmación y responde 201 con el contador nuevo', async () => {
    const id = await incidente();
    const ana = await vecino();

    const res = await ana.confirmar(id);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ incidenteId: id, cantidadConfirmaciones: 1 });
    expect(await confirmacionesDe(ana.id)).toEqual([{ incidenteId: id }]);
  });

  it('confirmar dos veces da 409 y no duplica', async () => {
    const id = await incidente();
    const ana = await vecino();
    await ana.confirmar(id);

    const res = await ana.confirmar(id);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('YA_CONFIRMADO');
    expect(await confirmacionesDe(ana.id)).toHaveLength(1);
  });

  it('se puede confirmar uno pendiente de revisión: se ve en el mapa', async () => {
    const id = await incidente({ estado: 'REGISTRADO' });
    expect((await (await vecino()).confirmar(id)).status).toBe(201);
  });

  it('en un incidente unido a otro, la confirmación va al principal', async () => {
    const principal = await incidente();
    const duplicado = await incidente({ principalId: principal });
    const ana = await vecino();

    const res = await ana.confirmar(duplicado);

    expect(res.status).toBe(201);
    expect(res.body.incidenteId).toBe(principal);
    expect(await confirmacionesDe(ana.id)).toEqual([{ incidenteId: principal }]);
  });

  it('quien confirmó un incidente antes de que se uniera a otro no confirma de nuevo en el principal', async () => {
    const principal = await incidente();
    const duplicado = await incidente();
    const ana = await vecino();
    await ana.confirmar(duplicado);
    await prisma.incidente.update({ where: { id: duplicado }, data: { incidentePrincipalId: principal } });

    const res = await ana.confirmar(principal);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('YA_CONFIRMADO');
  });

  it.each<EstadoIncidente>(['RESUELTO', 'DESESTIMADO'])('un incidente %s da 409', async (estado) => {
    const id = await incidente({ estado });
    const ana = await vecino();

    const res = await ana.confirmar(id);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INCIDENTE_CERRADO');
    expect(await confirmacionesDe(ana.id)).toEqual([]);
  });

  it('un incidente caducado da 409', async () => {
    const id = await incidente();
    await prisma.incidente.update({ where: { id }, data: { caducadoEn: new Date() } });
    const ana = await vecino();

    const res = await ana.confirmar(id);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INCIDENTE_CADUCADO');
    expect(await confirmacionesDe(ana.id)).toEqual([]);
  });

  it('un temporal vencido da 409, aunque la tarea diaria todavía no lo haya marcado', async () => {
    const vencio = new Date(Date.now() - 60 * 60 * 1000);
    const id = await incidente({ categoriaId: obra.id, vigenteHasta: vencio });
    const ana = await vecino();

    const res = await ana.confirmar(id);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INCIDENTE_CADUCADO');
    expect((await vigenciaDe(id)).vigenteHasta).toEqual(vencio);
  });

  it('un incidente que no existe da 404', async () => {
    const res = await (await vecino()).confirmar(2_000_000_000);
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('INCIDENTE_NO_ENCONTRADO');
  });
});

describe('permisos', () => {
  it('sin sesión da 401', async () => {
    const id = await incidente();
    const sinSesion = conToken();

    expect((await sinSesion.confirmar(id)).status).toBe(401);
    expect((await sinSesion.consultar(id)).status).toBe(401);
  });

  it.each(['OPERADOR', 'ADMINISTRADOR'] as const)('un %s recibe 403', async (rol) => {
    const id = await incidente();
    const api = conToken(await tokenDe(rol));

    expect((await api.confirmar(id)).status).toBe(403);
    expect((await api.consultar(id)).status).toBe(403);
    expect(await prisma.confirmacionIncidente.count({ where: { incidenteId: id } })).toBe(0);
  });
});

describe('vigencia al confirmar', () => {
  it('un temporal pasa a vencer a los días de su categoría contados desde la confirmación', async () => {
    const id = await incidente({ categoriaId: obra.id, vigenteHasta: new Date(Date.now() + 2 * DIA_MS) });

    const antes = Date.now();
    expect((await (await vecino()).confirmar(id)).status).toBe(201);

    const { vigenteHasta } = await vigenciaDe(id);
    expect(vigenteHasta!.getTime()).toBeGreaterThanOrEqual(antes + 10 * DIA_MS);
    expect(vigenteHasta!.getTime()).toBeLessThanOrEqual(Date.now() + 10 * DIA_MS);
  });

  it('si ya vencía más tarde, conserva su fecha', async () => {
    const vence = new Date(Date.now() + 20 * DIA_MS);
    const id = await incidente({ categoriaId: obra.id, vigenteHasta: vence });

    expect((await (await vecino()).confirmar(id)).status).toBe(201);

    expect((await vigenciaDe(id)).vigenteHasta).toEqual(vence);
  });

  it('con una categoría sin días, renueva con vigencia.dias_default', async () => {
    const id = await incidente({ categoriaId: sinDias.id, vigenteHasta: new Date(Date.now() + DIA_MS) });
    const dias = await diasVigenciaPorDefecto();

    const antes = Date.now();
    expect((await (await vecino()).confirmar(id)).status).toBe(201);

    const { vigenteHasta } = await vigenciaDe(id);
    expect(vigenteHasta!.getTime()).toBeGreaterThanOrEqual(antes + dias * DIA_MS);
    expect(vigenteHasta!.getTime()).toBeLessThanOrEqual(Date.now() + dias * DIA_MS);
  });

  it('un incidente permanente no cambia su vigencia', async () => {
    const id = await incidente();
    const { actualizadoEn } = await prisma.incidente.findUniqueOrThrow({ where: { id } });

    expect((await (await vecino()).confirmar(id)).status).toBe(201);

    const despues = await prisma.incidente.findUniqueOrThrow({ where: { id } });
    expect(despues).toMatchObject({ tipoVigencia: 'PERMANENTE', vigenteHasta: null, actualizadoEn });
  });
});

describe('prioridad al confirmar', () => {
  /** Un reporte de un vecino nuevo en un lugar propio: abre su incidente y calcula su prioridad. */
  async function reportar(categoriaId: number) {
    const reporte = await reportarEn({ lat: -38.9 - Math.random() * 0.2, lon: -68.35 }, { categoriaId });
    vecinos.push(reporte.vecinoId);
    const autor = await prisma.usuario.findUniqueOrThrow({ where: { id: reporte.vecinoId } });
    return { ...reporte, autor: conToken(crearTokenAcceso(autor)) };
  }

  const prioridadDe = async (id: number) => {
    const { puntajePrioridad, factorPrioridades } = await prisma.incidente.findUniqueOrThrow({
      where: { id },
      select: {
        puntajePrioridad: true,
        factorPrioridades: { select: { factor: true, valor: true, detalle: true }, orderBy: { id: 'asc' } },
      },
    });
    return { puntaje: Number(puntajePrioridad), factores: factorPrioridades };
  };

  it('la confirmación de otro vecino suma evidencia', async () => {
    const { incidenteId } = await reportar(categoria.id);

    expect((await (await vecino()).confirmar(incidenteId)).status).toBe(201);

    // n = 1 reporte + 1 vecino: 25 × ln 3 / ln 16
    const evidencias = (await prioridadDe(incidenteId)).factores[1];
    expect({ ...evidencias, valor: Number(evidencias!.valor) }).toEqual({
      factor: 'EVIDENCIAS',
      valor: 9.91,
      detalle: 'Lo reportaron 1 vez y lo confirmó 1 vecino: +9,9',
    });
  });

  it('la confirmación de quien ya lo reportó renueva la vigencia pero no cambia la prioridad', async () => {
    const { incidenteId, autor } = await reportar(obra.id);
    const antes = await prioridadDe(incidenteId);
    const vigenciaAntes = await vigenciaDe(incidenteId);

    expect((await autor.confirmar(incidenteId)).status).toBe(201);

    expect(await prioridadDe(incidenteId)).toEqual(antes);
    expect((await vigenciaDe(incidenteId)).vigenteHasta!.getTime()).toBeGreaterThan(
      vigenciaAntes.vigenteHasta!.getTime(),
    );
  });
});

describe('GET /api/incidentes/:id/confirmacion y la ficha', () => {
  it('cada vecino ve si confirmó, también desde un incidente unido', async () => {
    const principal = await incidente();
    const duplicado = await incidente({ principalId: principal });
    const ana = await vecino();
    const beto = await vecino();
    await ana.confirmar(duplicado);

    expect((await ana.consultar(principal)).body).toEqual({ confirmado: true });
    expect((await ana.consultar(duplicado)).body).toEqual({ confirmado: true });
    expect((await beto.consultar(principal)).body).toEqual({ confirmado: false });
  });

  it('un incidente que no existe da 404', async () => {
    expect((await (await vecino()).consultar(2_000_000_000)).status).toBe(404);
  });

  it('la ficha cuenta una vez a cada vecino que confirmó el incidente o uno de sus unidos', async () => {
    const principal = await incidente();
    const duplicado = await incidente({ principalId: principal });
    const [ana, beto] = [await vecino(), await vecino()];
    await prisma.confirmacionIncidente.createMany({
      data: [
        { incidenteId: principal, usuarioId: ana.id },
        { incidenteId: duplicado, usuarioId: ana.id },
        { incidenteId: duplicado, usuarioId: beto.id },
      ],
    });

    const ficha = await request(app).get(`/api/incidentes/${duplicado}`);

    expect(ficha.status).toBe(200);
    expect(ficha.body).toMatchObject({ id: principal, cantidadConfirmaciones: 2 });
  });
});
