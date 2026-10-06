import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/compartido/prisma.js';
import { cargarSemilla } from '../src/semilla/cargarSemilla.js';
import {
  CATEGORIAS,
  CLAVE_USUARIOS_PRUEBA,
  ORGANISMO,
  PARAMETROS,
  PERFILES,
  USUARIOS_PRUEBA,
} from '../src/semilla/datos.js';
import { ingresar } from './apoyo.js';

/** Todo lo que carga la semilla, leído de la base. Otros tests crean datos propios: se filtra por nombre. */
async function leerSemilla() {
  const organismos = await prisma.organismo.findMany({
    where: { nombre: ORGANISMO.nombre },
    include: { areas: { orderBy: { id: 'asc' } } },
  });
  const categorias = await prisma.categoria.findMany({
    where: { nombre: { in: CATEGORIAS.map((c) => c.nombre) } },
    orderBy: { id: 'asc' },
  });
  const perfiles = await prisma.perfilMovilidad.findMany({
    where: { nombre: { in: PERFILES.map((p) => p.nombre) } },
    orderBy: { id: 'asc' },
  });
  const matriz = await prisma.categoriaPerfil.findMany({
    where: { categoriaId: { in: categorias.map((c) => c.id) } },
    orderBy: [{ categoriaId: 'asc' }, { perfilMovilidadId: 'asc' }],
  });
  const parametros = await prisma.parametroSistema.findMany({
    where: { clave: { in: PARAMETROS.map((p) => p.clave) } },
    orderBy: { clave: 'asc' },
  });
  const usuarios = await prisma.usuario.findMany({
    where: { email: { in: USUARIOS_PRUEBA.map((u) => u.email) } },
    orderBy: { id: 'asc' },
  });
  return { organismos, categorias, perfiles, matriz, parametros, usuarios };
}

// Cada carga hace unas 60 consultas y compite por la base con el resto de los tests en paralelo.
describe('semilla', { timeout: 60_000 }, () => {
  it('correrla dos veces deja exactamente los mismos datos', async () => {
    await cargarSemilla(prisma);
    const primera = await leerSemilla();
    await cargarSemilla(prisma);
    const segunda = await leerSemilla();

    expect(segunda).toEqual(primera);
    expect(primera.organismos).toHaveLength(1);
    expect(primera.organismos[0]?.areas).toHaveLength(4);
    expect(primera.categorias).toHaveLength(CATEGORIAS.length);
    expect(primera.perfiles).toHaveLength(PERFILES.length);
    expect(primera.matriz).toHaveLength(CATEGORIAS.length * PERFILES.length);
    expect(primera.parametros).toHaveLength(PARAMETROS.length);
    expect(primera.usuarios).toHaveLength(USUARIOS_PRUEBA.length);
  });

  it('los usuarios de prueba quedan confirmados y pueden ingresar', async () => {
    await cargarSemilla(prisma);

    const { usuarios } = await leerSemilla();
    expect(usuarios.every((u) => u.emailVerificadoEn !== null)).toBe(true);
    expect(usuarios.filter((u) => u.rol === 'ADMINISTRADOR')).toHaveLength(1);
    expect(usuarios.filter((u) => u.rol === 'OPERADOR' && u.areaId !== null)).toHaveLength(2);
    expect(usuarios.filter((u) => u.rol === 'VECINO')).toHaveLength(3);

    const res = await ingresar('bacheo@snapit.test', CLAVE_USUARIOS_PRUEBA);
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('OPERADOR');
  });

  it('restaura lo que se haya cambiado a mano', async () => {
    await cargarSemilla(prisma);
    await prisma.categoria.update({ where: { nombre: 'Vereda rota' }, data: { activa: false } });
    await prisma.parametroSistema.update({
      where: { clave: 'agrupacion.radio_metros' },
      data: { valor: '999' },
    });

    await cargarSemilla(prisma);

    expect((await prisma.categoria.findUnique({ where: { nombre: 'Vereda rota' } }))?.activa).toBe(true);
    expect(
      (await prisma.parametroSistema.findUnique({ where: { clave: 'agrupacion.radio_metros' } }))?.valor,
    ).toBe('30');
  });

  it('no corre con NODE_ENV=production', async () => {
    const correr = promisify(execFile);
    const ejecucion = correr('npx', ['tsx', 'src/semilla/index.ts'], {
      env: { ...process.env, NODE_ENV: 'production' },
      shell: true,
    });

    await expect(ejecucion).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('NODE_ENV=production'),
    });
  }, 30_000);
});
