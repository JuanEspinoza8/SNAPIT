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
    await cargarSemilla(prisma, { usuariosPrueba: true });
    const primera = await leerSemilla();
    await cargarSemilla(prisma, { usuariosPrueba: true });
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
    await cargarSemilla(prisma, { usuariosPrueba: true });

    const { usuarios } = await leerSemilla();
    expect(usuarios.every((u) => u.emailVerificadoEn !== null)).toBe(true);
    expect(usuarios.filter((u) => u.rol === 'ADMINISTRADOR')).toHaveLength(1);
    expect(usuarios.filter((u) => u.rol === 'OPERADOR' && u.areaId !== null)).toHaveLength(2);
    expect(usuarios.filter((u) => u.rol === 'VECINO')).toHaveLength(3);

    const res = await ingresar('bacheo@snapit.test', CLAVE_USUARIOS_PRUEBA);
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('OPERADOR');
  });

  // No modifica categorías ni perfiles: los tests de otros módulos los leen de la misma base, en paralelo.
  it('restaura lo que se haya cambiado a mano', async () => {
    await cargarSemilla(prisma, { usuariosPrueba: true });
    const celda = {
      categoriaId_perfilMovilidadId: {
        categoriaId: (await prisma.categoria.findUniqueOrThrow({ where: { nombre: 'Vereda rota' } })).id,
        perfilMovilidadId: (
          await prisma.perfilMovilidad.findUniqueOrThrow({ where: { nombre: 'Silla de ruedas' } })
        ).id,
      },
    };
    await prisma.categoriaPerfil.update({
      where: celda,
      data: { intransitable: false, factorPenalizacion: '9.00' },
    });
    await prisma.parametroSistema.update({ where: { clave: 'agrupacion.radio_m' }, data: { valor: '999' } });

    await cargarSemilla(prisma, { usuariosPrueba: true });

    expect(await prisma.categoriaPerfil.findUnique({ where: celda })).toMatchObject({ intransitable: true });
    expect(
      (await prisma.parametroSistema.findUnique({ where: { clave: 'agrupacion.radio_m' } }))?.valor,
    ).toBe('30');
  });

  it('sin usuarios de prueba carga el resto y no toca a esos usuarios', async () => {
    await cargarSemilla(prisma, { usuariosPrueba: true });
    await prisma.usuario.update({ where: { email: 'vecino1@snapit.test' }, data: { nombre: 'Cambiado' } });

    const totales = await cargarSemilla(prisma, { usuariosPrueba: false });

    expect(totales).toMatchObject({ parametros: PARAMETROS.length, usuarios: 0 });
    const vecino = await prisma.usuario.findUniqueOrThrow({ where: { email: 'vecino1@snapit.test' } });
    expect(vecino.nombre).toBe('Cambiado');
  });

  it('con NODE_ENV=production no carga los usuarios de prueba ni muestra la clave', async () => {
    const correr = promisify(execFile);
    const { stdout } = await correr(process.execPath, ['--import', 'tsx', 'src/semilla/index.ts'], {
      env: { ...process.env, NODE_ENV: 'production' },
    });

    expect(stdout).toContain('no se cargan los usuarios de prueba');
    expect(stdout).not.toContain(CLAVE_USUARIOS_PRUEBA);
  }, 30_000);
});
