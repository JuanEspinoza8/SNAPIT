import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { severidadConsolidada } from '../src/modulos/agrupacion/calculo.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { pendientesParaIa } from '../src/modulos/verificacion/repositorio.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn } from './apoyo.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let organismoId: number;
let categoriaId: number;
let areaId: number;
// Cada test en su propio punto: sus reportes caen juntos en un incidente, sin cruzarse con los de otro test.
let punto: { lat: number; lon: number };

beforeEach(async () => {
  const { organismo, area, categoria } = await crearOrganismoDePrueba();
  organismoId = organismo.id;
  areaId = area.id;
  categoriaId = categoria.id;
  punto = { lat: -38.9 - Math.random() * 0.05, lon: -68.0 - Math.random() * 0.05 };
});

async function reportar(opciones: { severidad?: 'LEVE' | 'MODERADA' | 'GRAVE'; pendiente?: boolean } = {}) {
  const reporte = await reportarEn(punto, { categoriaId, ...opciones });
  vecinos.push(reporte.vecinoId);
  return reporte;
}

const tokenDelVecino = async (vecinoId: number) =>
  crearTokenAcceso(await prisma.usuario.findUniqueOrThrow({ where: { id: vecinoId } }));

const eliminar = (id: number, token: string) =>
  request(app).delete(`/api/reportes/${id}`).set('Authorization', `Bearer ${token}`);

describe('DELETE /api/reportes/:id', () => {
  it('su autor lo elimina: deja de contar como un desestimado y la reputación no cambia', async () => {
    const grave = await reportar({ severidad: 'GRAVE' });
    const leve = await reportar({ severidad: 'LEVE' });
    expect(leve.incidenteId).toBe(grave.incidenteId);
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: grave.vecinoId } });
    const token = await tokenDelVecino(grave.vecinoId);

    const res = await eliminar(grave.id, token);

    expect(res.status).toBe(204);
    const reporte = await prisma.reporte.findUniqueOrThrow({ where: { id: grave.id } });
    expect(reporte.eliminadoEn).not.toBeNull();
    const incidente = await prisma.incidente.findUniqueOrThrow({ where: { id: grave.incidenteId } });
    expect(incidente.cantidadReportes).toBe(1);
    expect(incidente.severidad).toBe(severidadConsolidada(['LEVE']));
    const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: grave.vecinoId } });
    expect(despues.reputacion).toEqual(antes.reputacion);
    expect(despues.reportesConfirmados).toBe(antes.reportesConfirmados);
    // Mis reportes ya no lo muestra.
    const mios = await request(app).get('/api/reportes/mios').set('Authorization', `Bearer ${token}`);
    expect(mios.body.reportes).toEqual([]);
  });

  it('el reporte de otro → 403; uno ya eliminado → 404; un operador no elimina', async () => {
    const primero = await reportar();
    await reportar();
    const otroVecino = crearTokenAcceso(await crearUsuario({ rol: 'VECINO' }));
    const operador = crearTokenAcceso(await crearUsuario({ rol: 'OPERADOR' }));

    expect((await eliminar(primero.id, otroVecino)).status).toBe(403);
    expect((await eliminar(primero.id, operador)).status).toBe(403);
    const token = await tokenDelVecino(primero.vecinoId);
    expect((await eliminar(primero.id, token)).status).toBe(204);
    expect((await eliminar(primero.id, token)).status).toBe(404);
    expect((await eliminar(999_999_999, token)).status).toBe(404);
  });

  it('el único reporte visible de su incidente → 409 UNICO_REPORTE', async () => {
    const solo = await reportar();

    const res = await eliminar(solo.id, await tokenDelVecino(solo.vecinoId));

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('UNICO_REPORTE');
    expect((await prisma.reporte.findUniqueOrThrow({ where: { id: solo.id } })).eliminadoEn).toBeNull();
  });

  it('un desestimado se puede eliminar: ya no contaba, solo deja de verse', async () => {
    const desestimado = await reportar({ pendiente: true });
    const otro = await reportar();
    await prisma.reporte.update({
      where: { id: desestimado.id },
      data: { estadoVerificacion: 'DESESTIMADO' },
    });
    const antes = await prisma.incidente.findUniqueOrThrow({ where: { id: otro.incidenteId } });

    const res = await eliminar(desestimado.id, await tokenDelVecino(desestimado.vecinoId));

    expect(res.status).toBe(204);
    const despues = await prisma.incidente.findUniqueOrThrow({ where: { id: otro.incidenteId } });
    expect(despues.cantidadReportes).toBe(antes.cantidadReportes);
  });

  it('un pendiente eliminado sale de la revisión y de la cola de la IA', async () => {
    const pendiente = await reportar({ pendiente: true });
    await reportar();
    const operador = await crearUsuario({ rol: 'OPERADOR', organismoId, areaId });
    const pendientes = () =>
      request(app)
        .get('/api/reportes/pendientes')
        .set('Authorization', `Bearer ${crearTokenAcceso(operador)}`);
    expect((await pendientes()).body.reportes.map((r: { id: number }) => r.id)).toContain(pendiente.id);

    expect((await eliminar(pendiente.id, await tokenDelVecino(pendiente.vecinoId))).status).toBe(204);

    expect((await pendientes()).body.reportes.map((r: { id: number }) => r.id)).not.toContain(pendiente.id);
    expect((await pendientesParaIa(organismoId)).map((r) => r.id)).not.toContain(pendiente.id);
  });
});
