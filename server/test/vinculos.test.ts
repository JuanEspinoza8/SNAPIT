import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { revincularIncidentes } from '../src/modulos/red/repositorio.js';
import { describirVinculos, importarRed } from '../src/modulos/red/servicio.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn } from './apoyo.js';

// Reemplaza toda la red de la base de pruebas, como importar-red.test.ts: corre solo, al final (vitest.config.ts).

// La dirección no se consulta: no hace falta para vincular.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

/*
 * La misma grilla de test/osm/recorte-red.json (el dibujo está en importar-red.test.ts). Las cuadras miden
 * unos 100 m. Con el radio de partida (15 m):
 * - A la esquina 11 llegan cinco tramos: 01─11, 11─21, 10─11, 11─12 y la diagonal 00─11.
 * - La vereda suelta f1─f2 corre 30 m al norte de la Calle Uno (00 ─ 10 ─ 20), entre las columnas 1,3 y 1,7.
 * - 21─31 sale de la zona: el borde pasa 20 m al este de la columna 2.
 */
const RECORTE = fileURLToPath(new URL('./osm/recorte-red.json', import.meta.url));
const BASE = 900_000_000_000_000;
const esquina = (columna: number, fila: number) => BASE + 100 + 10 * columna + fila;
const F1 = BASE + 208;
const F2 = BASE + 209;

const ZONA = 'Zona de prueba de vínculos';
const enGrilla = (columna: number, fila: number) => ({
  lon: -68.5 + columna * 0.00115,
  lat: -38.7 + fila * 0.0009,
});
// Un metro de latitud, en grados.
const METRO = 1 / 111_000;
const alNorte = (punto: { lat: number; lon: number }, metros: number) => ({
  ...punto,
  lat: punto.lat + metros * METRO,
});

const vecinos: number[] = [];

const importar = () =>
  importarRed({
    prisma,
    archivo: RECORTE,
    sinConexion: true,
    overpass: { consultar: () => Promise.reject(new Error('Sin conexión en los tests')) },
  });
const vaciarRed = () => prisma.$executeRaw`TRUNCATE tramo_peatonal, nodo_peatonal RESTART IDENTITY CASCADE`;

/** Un reporte en ese punto, en una categoría propia: no se agrupa con los de otros tests. */
async function incidenteEn(punto: { lat: number; lon: number }) {
  const { categoria } = await crearOrganismoDePrueba();
  const reporte = await reportarEn(punto, { categoriaId: categoria.id });
  vecinos.push(reporte.vecinoId);
  return reporte.incidenteId;
}

/** Los tramos que obstruye el incidente, como "origen-destino" con los osm_id de sus extremos, ordenados. */
async function tramosDe(incidenteId: number) {
  const filas = await prisma.$queryRaw<{ origen: bigint; destino: bigint }[]>`
    SELECT o.osm_id AS origen, d.osm_id AS destino
    FROM incidente_tramo it
    JOIN tramo_peatonal t ON t.id = it.tramo_peatonal_id
    JOIN nodo_peatonal o ON o.id = t.nodo_origen_id
    JOIN nodo_peatonal d ON d.id = t.nodo_destino_id
    WHERE it.incidente_id = ${incidenteId}`;
  return filas.map(({ origen, destino }) => [Number(origen), Number(destino)].sort().join('-')).sort();
}
const tramo = (a: number, b: number) => [a, b].sort().join('-');

const leerVinculos = () =>
  prisma.$queryRaw<{ incidenteId: number; tramoId: bigint }[]>`
    SELECT incidente_id AS "incidenteId", tramo_peatonal_id AS "tramoId"
    FROM incidente_tramo ORDER BY incidente_id, tramo_peatonal_id`;

beforeAll(async () => {
  await prisma.$executeRaw`DELETE FROM zona_piloto WHERE nombre = ${ZONA}`;
  const borde = [
    [-0.2, -0.2],
    [2.2, -0.2],
    [2.2, 2.2],
    [-0.2, 2.2],
    [-0.2, -0.2],
  ].map(([columna, fila]) => enGrilla(columna!, fila!));
  const poligono = `POLYGON((${borde.map(({ lon, lat }) => `${lon} ${lat}`).join(', ')}))`;
  await prisma.$executeRaw`
    INSERT INTO zona_piloto (nombre, geometria) VALUES (${ZONA}, ST_GeomFromText(${poligono}, 4326)::geography)`;
  await importar();
});

afterAll(async () => {
  await borrarReportesDe(vecinos);
  await vaciarRed();
  await prisma.$executeRaw`DELETE FROM zona_piloto WHERE nombre = ${ZONA}`;
});

describe('vincular un incidente nuevo con los tramos que obstruye', () => {
  it('en una esquina, vincula los tramos que llegan a ella', async () => {
    const id = await incidenteEn(enGrilla(1, 1));

    expect(await tramosDe(id)).toEqual(
      [
        tramo(esquina(0, 1), esquina(1, 1)),
        tramo(esquina(1, 1), esquina(2, 1)),
        tramo(esquina(1, 0), esquina(1, 1)),
        tramo(esquina(1, 1), esquina(1, 2)),
        tramo(esquina(0, 0), esquina(1, 1)),
      ].sort(),
    );
  });

  it('en la mitad de una cuadra, vincula solo esa cuadra', async () => {
    const id = await incidenteEn(enGrilla(1.5, 0));

    expect(await tramosDe(id)).toEqual([tramo(esquina(1, 0), esquina(2, 0))]);
  });

  it('a 14 m del tramo lo vincula; a 16 m, no', async () => {
    const cerca = await incidenteEn(alNorte(enGrilla(1.5, 0), -14));
    const lejos = await incidenteEn(alNorte(enGrilla(1.5, 0), -16));

    expect(await tramosDe(cerca)).toEqual([tramo(esquina(1, 0), esquina(2, 0))]);
    expect(await tramosDe(lejos)).toEqual([]);
  });

  it('a 10 m de una esquina también vincula todos los tramos que llegan a ella', async () => {
    const id = await incidenteEn(enGrilla(2.1, 1));

    expect(await tramosDe(id)).toEqual(
      [
        tramo(esquina(1, 1), esquina(2, 1)),
        tramo(esquina(2, 1), esquina(3, 1)),
        tramo(esquina(2, 0), esquina(2, 1)),
        tramo(esquina(2, 1), esquina(2, 2)),
      ].sort(),
    );
  });

  it('fuera de la zona no genera vínculos, aunque esté sobre un tramo de la red', async () => {
    const id = await incidenteEn(enGrilla(2.4, 1));

    expect(await tramosDe(id)).toEqual([]);
  });

  it('un reporte que se suma a un incidente no le cambia los vínculos', async () => {
    const { categoria } = await crearOrganismoDePrueba();
    const primero = await reportarEn(enGrilla(1.5, 0), { categoriaId: categoria.id });
    const segundo = await reportarEn(alNorte(enGrilla(1.5, 0), 5), { categoriaId: categoria.id });
    vecinos.push(primero.vecinoId, segundo.vecinoId);

    expect(segundo.incidenteId).toBe(primero.incidenteId);
    expect(await tramosDe(primero.incidenteId)).toEqual([tramo(esquina(1, 0), esquina(2, 0))]);
  });
});

describe('separar un reporte', () => {
  it('el incidente nuevo obstruye los tramos de su punto y el original, los de su punto nuevo', async () => {
    const { organismo, area, categoria } = await crearOrganismoDePrueba();
    const operador = await crearUsuario({ rol: 'OPERADOR', organismoId: organismo.id, areaId: area.id });
    // A 10 m de la Calle Uno y a 20 m de la vereda suelta, y al revés: a 10 m entre sí, se agrupan.
    const primero = await reportarEn(alNorte(enGrilla(1.5, 0), 10), { categoriaId: categoria.id });
    const segundo = await reportarEn(alNorte(enGrilla(1.5, 0), 20), { categoriaId: categoria.id });
    vecinos.push(primero.vecinoId, segundo.vecinoId);
    expect(segundo.incidenteId).toBe(primero.incidenteId);
    expect(await tramosDe(primero.incidenteId)).toEqual([tramo(esquina(1, 0), esquina(2, 0))]);

    const res = await request(app)
      .post(`/api/reportes/${primero.id}/separacion`)
      .set('Authorization', `Bearer ${crearTokenAcceso(operador)}`)
      .send({});

    expect(res.status).toBe(200);
    expect(await tramosDe(res.body.incidenteNuevo.id)).toEqual([tramo(esquina(1, 0), esquina(2, 0))]);
    expect(await tramosDe(primero.incidenteId)).toEqual([tramo(F1, F2)]);
  });
});

describe('recalcular los vínculos', () => {
  it('reimportar la red deja los mismos vínculos, y recalcularlos también', async () => {
    const esquinaId = await incidenteEn(enGrilla(1, 1));
    const resuelto = await incidenteEn(enGrilla(1.5, 0));
    // El recorrido ya filtra los vigentes: uno resuelto conserva sus vínculos.
    await prisma.incidente.update({ where: { id: resuelto }, data: { estado: 'RESUELTO' } });
    const antes = await leerVinculos();
    expect(antes.length).toBeGreaterThanOrEqual(6);

    const resumen = await importar();

    expect(resumen.vinculosBorrados).toBe(antes.length);
    expect(resumen.vinculos).toMatchObject({ radioM: 15, vinculos: antes.length });
    expect(await leerVinculos()).toEqual(antes);

    const recalculados = await revincularIncidentes(prisma);

    expect(recalculados).toMatchObject({ radioM: 15, antes: antes.length, vinculos: antes.length });
    expect(await leerVinculos()).toEqual(antes);
    expect(await tramosDe(esquinaId)).toHaveLength(5);
    expect(await tramosDe(resuelto)).toHaveLength(1);
  });

  it('con otro radio, el recálculo usa el nuevo', async () => {
    const id = await incidenteEn(alNorte(enGrilla(1.5, 0), -16));
    expect(await tramosDe(id)).toEqual([]);
    await prisma.parametroSistema.update({
      where: { clave: 'ruteo.radio_obstruccion_m' },
      data: { valor: '20' },
    });

    try {
      const recalculados = await revincularIncidentes(prisma);

      expect(recalculados.radioM).toBe(20);
      expect(await tramosDe(id)).toEqual([tramo(esquina(1, 0), esquina(2, 0))]);
    } finally {
      await prisma.parametroSistema.update({
        where: { clave: 'ruteo.radio_obstruccion_m' },
        data: { valor: '15' },
      });
      await revincularIncidentes(prisma);
    }
  });

  it('el resumen dice cuántos incidentes obstruyen cuántos tramos', () => {
    expect(describirVinculos({ radioM: 15, antes: 2, vinculos: 6, incidentes: 2 })).toBe(
      'Incidentes vinculados con la red (tramos a 15 m o menos): 2 incidentes obstruyen 6 tramos. Antes había 2 vínculos.',
    );
    expect(describirVinculos({ radioM: 15, antes: 0, vinculos: 1, incidentes: 1 })).toBe(
      'Incidentes vinculados con la red (tramos a 15 m o menos): 1 incidente obstruye 1 tramo. Antes había 0 vínculos.',
    );
    expect(describirVinculos({ radioM: 15, antes: 1, vinculos: 0, incidentes: 0 })).toBe(
      'Incidentes vinculados con la red (tramos a 15 m o menos): ningún incidente de las zonas piloto queda cerca de un tramo. Antes había 1 vínculo.',
    );
  });
});
