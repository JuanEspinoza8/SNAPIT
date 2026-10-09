import { access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { almacenFotos } from '../src/compartido/almacenFotos.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import * as repositorio from '../src/modulos/reportes/repositorio.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { jpegConExif } from './imagenes.js';

// Envuelve la función real para poder hacerla fallar en un test puntual.
vi.mock('../src/modulos/reportes/repositorio.js', async (original) => {
  const real = await original<typeof import('../src/modulos/reportes/repositorio.js')>();
  return { ...real, crearReporteConIncidente: vi.fn(real.crearReporteConIncidente) };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

async function preparar() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  const usuario = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(usuario.id);
  return { categoria, usuario, token: crearTokenAcceso(usuario) };
}

function enviar(token: string, categoriaId: number) {
  return request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${token}`)
    .field('categoriaId', String(categoriaId))
    .field('severidadDeclarada', 'LEVE')
    .field('lat', '-38.95')
    .field('lon', '-68.06')
    .field('origen', 'SITIO_WEB')
    .attach('foto', jpegConExif(), 'foto.jpg');
}

const existe = (ubicacion: string) =>
  access(ubicacion).then(
    () => true,
    () => false,
  );

describe('POST /api/reportes cuando algo falla', () => {
  it('si no se puede guardar el archivo, no queda ningún reporte', async () => {
    const { categoria, usuario, token } = await preparar();
    vi.spyOn(almacenFotos, 'guardar').mockRejectedValueOnce(new Error('disco lleno'));

    const res = await enviar(token, categoria.id);

    expect(res.status).toBe(500);
    expect(await prisma.reporte.count({ where: { usuarioId: usuario.id } })).toBe(0);
  });

  it('si falla la base, se borra el archivo que ya se había guardado', async () => {
    const { categoria, usuario, token } = await preparar();
    const guardar = vi.spyOn(almacenFotos, 'guardar');
    vi.mocked(repositorio.crearReporteConIncidente).mockRejectedValueOnce(new Error('base caída'));

    const res = await enviar(token, categoria.id);

    expect(res.status).toBe(500);
    const ruta = await guardar.mock.results[0]!.value;
    expect(await existe(almacenFotos.ubicacion(ruta))).toBe(false);
    expect(await prisma.reporte.count({ where: { usuarioId: usuario.id } })).toBe(0);
  });

  it('cuando todo sale bien, el archivo queda guardado', async () => {
    const { categoria, token } = await preparar();
    const guardar = vi.spyOn(almacenFotos, 'guardar');

    const res = await enviar(token, categoria.id);

    expect(res.status).toBe(201);
    expect(await existe(almacenFotos.ubicacion(await guardar.mock.results[0]!.value))).toBe(true);
  });
});
