import { randomUUID } from 'node:crypto';
import type { Area, Categoria, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn, tokenDe } from './apoyo.js';

// La dirección no se consulta: no hace falta para cambiar la categoría.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let categoria: Categoria;
/** De otra área del mismo organismo, y con el doble de peso. */
let nueva: Categoria;
let operador: Usuario;
let token: string;
let lat: number;
const lon = -68.4;

beforeEach(async () => {
  ({ area, categoria } = await crearOrganismoDePrueba());
  const veredas = await prisma.area.create({ data: { organismoId: area.organismoId, nombre: 'Veredas' } });
  nueva = await prisma.categoria.create({
    data: { nombre: `Vereda rota ${randomUUID()}`, areaId: veredas.id, pesoSeveridadBase: '2.00' },
  });
  operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });
  token = crearTokenAcceso(operador);
  lat = -38.9 - Math.random() * 0.2;
});

async function reportar(cuadra = 0, opciones: { pendiente?: boolean; categoriaId?: number } = {}) {
  const reporte = await reportarEn(
    { lat: lat - cuadra * 0.001, lon },
    { categoriaId: opciones.categoriaId ?? categoria.id, pendiente: opciones.pendiente },
  );
  vecinos.push(reporte.vecinoId);
  return reporte;
}

const cambiar = (id: number, cuerpo: object, conToken = token) =>
  request(app).put(`/api/incidentes/${id}/categoria`).set('Authorization', `Bearer ${conToken}`).send(cuerpo);

describe('PUT /api/incidentes/:id/categoria', () => {
  it('cambia la categoría, deja el antes y el después en la bitácora y recalcula la prioridad', async () => {
    const reporte = await reportar();
    const id = reporte.incidenteId;

    const res = await cambiar(id, { categoriaId: nueva.id, comentario: 'Es la vereda, no la calle' });

    expect(res.status).toBe(200);
    // Sin derivar, pasa al área de la categoría nueva. MODERADA con peso 2: 26,67 × 2 + 6,25 de evidencias.
    expect(res.body).toMatchObject({
      id,
      categoria: { id: nueva.id, nombre: nueva.nombre },
      area: { id: nueva.areaId, nombre: 'Veredas' },
      prioridad: { puntajePrioridad: 59.58, prioridadManual: null },
      movimiento: {
        tipo: 'COMENTARIO',
        usuario: { id: operador.id, nombre: operador.nombre },
        comentario: `Categoría cambiada de ${categoria.nombre} a ${nueva.nombre}: Es la vereda, no la calle`,
      },
    });
    expect(res.body.prioridad.factores[0]).toMatchObject({ factor: 'SEVERIDAD', valor: 53.33 });

    const guardado = await prisma.incidente.findUniqueOrThrow({
      where: { id },
      select: { categoriaId: true, puntajePrioridad: true, factorPrioridades: { select: { factor: true } } },
    });
    expect(guardado).toMatchObject({ categoriaId: nueva.id });
    expect(Number(guardado.puntajePrioridad)).toBe(59.58);
    expect(guardado.factorPrioridades).toHaveLength(4);
    // La categoría que eligió el vecino no cambia.
    const delVecino = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(delVecino.categoriaId).toBe(categoria.id);
  });

  it('sin comentario, el movimiento dice solo el cambio; un derivado se queda en su área', async () => {
    const id = (await reportar()).incidenteId;
    await request(app)
      .post(`/api/incidentes/${id}/derivacion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id });

    const res = await cambiar(id, { categoriaId: nueva.id });

    expect(res.status).toBe(200);
    expect(res.body.area).toEqual({ id: area.id, nombre: area.nombre });
    expect(res.body.movimiento.comentario).toBe(
      `Categoría cambiada de ${categoria.nombre} a ${nueva.nombre}`,
    );
  });

  it('se puede corregir un incidente en revisión', async () => {
    const id = (await reportar(0, { pendiente: true })).incidenteId;
    const res = await cambiar(id, { categoriaId: nueva.id });
    expect(res.status).toBe(200);
  });

  it('desde el cambio, el incidente agrupa los reportes de la categoría nueva', async () => {
    const id = (await reportar()).incidenteId;
    await cambiar(id, { categoriaId: nueva.id });

    expect((await reportar(0, { categoriaId: nueva.id })).incidenteId).toBe(id);
    expect((await reportar(0)).incidenteId).not.toBe(id);
  });

  it('una categoría inactiva, inexistente o de otro organismo da 400', async () => {
    const id = (await reportar()).incidenteId;
    const inactiva = await prisma.categoria.create({
      data: { nombre: `Inactiva ${randomUUID()}`, areaId: area.id, activa: false },
    });
    const ajena = (await crearOrganismoDePrueba()).categoria;

    const casos: [object, string][] = [
      [{ categoriaId: inactiva.id }, 'No existe o no está activa'],
      [{ categoriaId: 2_000_000_000 }, 'No existe o no está activa'],
      [{ categoriaId: ajena.id }, 'Es de un área de otro organismo'],
      [{}, 'Tiene que ser un número'],
    ];
    for (const [cuerpo, mensaje] of casos) {
      const res = await cambiar(id, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
      expect(res.body.error.detalles).toEqual([{ campo: 'categoriaId', mensaje }]);
    }
    const sinCambios = await prisma.incidente.findUniqueOrThrow({ where: { id } });
    expect(sinCambios.categoriaId).toBe(categoria.id);
    expect(await prisma.movimientoIncidente.count({ where: { incidenteId: id, tipo: 'COMENTARIO' } })).toBe(
      0,
    );
  });

  it('la misma categoría da 409', async () => {
    const id = (await reportar()).incidenteId;
    const res = await cambiar(id, { categoriaId: categoria.id });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('MISMA_CATEGORIA');
  });

  it('no cambia uno desestimado, unido ni caducado', async () => {
    const desestimado = (await reportar(0)).incidenteId;
    await request(app)
      .post(`/api/incidentes/${desestimado}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'DESESTIMADO', comentario: 'Duplicado' });
    const principal = (await reportar(1)).incidenteId;
    const unido = (await reportar(2)).incidenteId;
    await request(app)
      .post(`/api/incidentes/${unido}/union`)
      .set('Authorization', `Bearer ${token}`)
      .send({ principalId: principal });
    const caducado = (await reportar(3)).incidenteId;
    await prisma.incidente.update({ where: { id: caducado }, data: { caducadoEn: new Date() } });

    expect((await cambiar(desestimado, { categoriaId: nueva.id })).body.error.codigo).toBe(
      'INCIDENTE_CERRADO',
    );
    expect((await cambiar(unido, { categoriaId: nueva.id })).body.error.codigo).toBe('INCIDENTE_UNIDO');
    expect((await cambiar(caducado, { categoriaId: nueva.id })).body.error.codigo).toBe('INCIDENTE_CADUCADO');
  });

  it('otro organismo da 403, uno que no existe 404 y un vecino no entra', async () => {
    const otro = await crearOrganismoDePrueba();
    const ajeno = (await reportar(0, { categoriaId: otro.categoria.id })).incidenteId;

    expect((await cambiar(ajeno, { categoriaId: otro.categoria.id })).status).toBe(403);
    expect((await cambiar(2_000_000_000, { categoriaId: nueva.id })).status).toBe(404);
    expect((await cambiar(ajeno, { categoriaId: nueva.id }, await tokenDe('VECINO'))).status).toBe(403);
  });
});
