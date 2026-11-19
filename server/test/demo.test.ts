import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/compartido/prisma.js';
import { cargarDemo } from '../src/semilla/cargarDemo.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario } from './apoyo.js';
import { EXIF_DE_PRUEBA, fotoUnica, jpegConExif, jpegSinExif } from './imagenes.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

let carpeta: string;
const vecinos: number[] = [];
// Una categoría y vecinos propios: así los reportes no se agrupan ni se cruzan con los de otros tests.
let categoria: string;
let ana: string;
let bruno: string;

beforeAll(async () => {
  categoria = (await crearOrganismoDePrueba()).categoria.nombre;
  const [a, b] = await Promise.all([crearUsuario(), crearUsuario()]);
  vecinos.push(a.id, b.id);
  [ana, bruno] = [a.email, b.email];
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'snapit-demo-'));
  await writeFile(path.join(carpeta, 'en-el-lugar.jpg'), await fotoUnica(jpegConExif()));
  await writeFile(path.join(carpeta, 'sin-gps.jpg'), await fotoUnica(jpegSinExif()));
});

afterAll(async () => {
  await borrarReportesDe(vecinos);
  await rm(carpeta, { recursive: true, force: true });
});

const manifiesto = (contenido: unknown) =>
  writeFile(path.join(carpeta, 'demo.json'), JSON.stringify(contenido));

describe('reportes para la demo', () => {
  it('carga cada foto como un reporte pendiente, con el punto de su EXIF o del manifiesto', async () => {
    await manifiesto([
      // La categoría, sin importar mayúsculas.
      { foto: 'en-el-lugar.jpg', categoria: categoria.toUpperCase(), gravedad: 'GRAVE', vecino: ana },
      { foto: 'sin-gps.jpg', categoria, gravedad: 'LEVE', vecino: bruno, lat: -38.96, lon: -68.07 },
    ]);

    const resultados = await cargarDemo(carpeta);

    expect(resultados.map((r) => [r.vecino, r.punto, r.estadoVerificacion])).toEqual([
      [ana, 'la foto', 'PENDIENTE_REVISION'],
      [bruno, 'demo.json', 'PENDIENTE_REVISION'],
    ]);
    const guardados = await prisma.reporte.findMany({
      where: { id: { in: resultados.map((r) => r.id) } },
      orderBy: { id: 'asc' },
    });
    expect(guardados.map((r) => r.severidadDeclarada)).toEqual(['GRAVE', 'LEVE']);
    // La foto con GPS queda en su punto: el control de ubicación se cumple.
    const ubicacion = await prisma.senalVerificacion.findFirstOrThrow({
      where: { reporteId: resultados[0]!.id, tipo: 'EXIF_COINCIDE' },
    });
    expect(Number(ubicacion.valor)).toBe(1);
    const [punto] = await prisma.$queryRaw<{ lat: number }[]>`
      SELECT ST_Y(ubicacion::geometry) AS lat FROM reporte WHERE id = ${resultados[0]!.id}`;
    expect(punto!.lat).toBeCloseTo(EXIF_DE_PRUEBA.latitud, 5);
  });

  it('avisa qué está mal: una categoría que no existe o un vecino que no está', async () => {
    await manifiesto([{ foto: 'sin-gps.jpg', categoria: 'No existe', gravedad: 'LEVE' }]);
    await expect(cargarDemo(carpeta)).rejects.toThrow(/no existe la categoría «No existe»/);

    await manifiesto([{ foto: 'sin-gps.jpg', categoria, gravedad: 'LEVE', vecino: 'nadie@snapit.test' }]);
    await expect(cargarDemo(carpeta)).rejects.toThrow(/no existe el vecino nadie@snapit.test/);
  });
});
