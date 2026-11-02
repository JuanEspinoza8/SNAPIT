import { readFile } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { leerZonasPiloto } from '../modulos/red/zonaPiloto.js';
import {
  AREAS,
  ARCHIVO_ZONAS_PILOTO,
  CATEGORIAS,
  CLAVE_USUARIOS_PRUEBA,
  MATRIZ_CATEGORIA_PERFIL,
  ORGANISMO,
  PARAMETROS,
  PERFILES,
  USUARIOS_PRUEBA,
} from './datos.js';

async function leerArchivoZonas(archivo: string) {
  try {
    return leerZonasPiloto(await readFile(archivo, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`No se encontró el archivo de zonas piloto: ${archivo}`, { cause: error });
    }
    throw error;
  }
}

/**
 * Carga el catálogo, los parámetros, las zonas piloto y, si se pide, los usuarios de prueba. Se puede correr
 * las veces que haga falta: cada dato se busca por su nombre o clave y se actualiza si ya existe, así que nunca
 * se duplica. Las zonas salen de `db/datos/zona-piloto.geojson` (o del archivo que se pase).
 */
export async function cargarSemilla(
  prisma: PrismaClient,
  {
    usuariosPrueba,
    archivoZonasPiloto = ARCHIVO_ZONAS_PILOTO,
  }: { usuariosPrueba: boolean; archivoZonasPiloto?: string },
) {
  // Fuera de la transacción: bcrypt tarda y la transacción tiene un tiempo máximo.
  const hashClavePrueba = await bcrypt.hash(CLAVE_USUARIOS_PRUEBA, 10);
  const zonasPiloto = await leerArchivoZonas(archivoZonasPiloto);

  // Son unas 60 consultas seguidas: se amplían los tiempos por defecto de Prisma (2 s para empezar, 5 s en total).
  return prisma.$transaction(
    async (tx) => {
      // organismo y area no tienen nombre único en el modelo: se busca primero y después se crea o actualiza.
      const existente = await tx.organismo.findFirst({ where: { nombre: ORGANISMO.nombre } });
      const organismo = existente
        ? await tx.organismo.update({ where: { id: existente.id }, data: { ...ORGANISMO, activo: true } })
        : await tx.organismo.create({ data: ORGANISMO });

      const areas = new Map<string, number>();
      for (const area of AREAS) {
        const encontrada = await tx.area.findFirst({
          where: { organismoId: organismo.id, nombre: area.nombre },
        });
        const guardada = encontrada
          ? await tx.area.update({ where: { id: encontrada.id }, data: { ...area, activa: true } })
          : await tx.area.create({ data: { ...area, organismoId: organismo.id } });
        areas.set(area.nombre, guardada.id);
      }

      const categorias = new Map<string, number>();
      for (const { nombre, descripcion, area, tipoVigencia, diasCaducidad, peso } of CATEGORIAS) {
        const datos = {
          descripcion,
          areaId: areas.get(area)!,
          tipoVigenciaDefault: tipoVigencia,
          diasCaducidadDefault: diasCaducidad,
          pesoSeveridadBase: peso,
          activa: true,
        };
        const categoria = await tx.categoria.upsert({
          where: { nombre },
          create: { nombre, ...datos },
          update: datos,
        });
        categorias.set(nombre, categoria.id);
      }

      const perfiles = new Map<string, number>();
      for (const { nombre, descripcion } of PERFILES) {
        const perfil = await tx.perfilMovilidad.upsert({
          where: { nombre },
          create: { nombre, descripcion },
          update: { descripcion, activo: true },
        });
        perfiles.set(nombre, perfil.id);
      }

      for (const [categoria, efectos] of Object.entries(MATRIZ_CATEGORIA_PERFIL)) {
        for (const [perfil, efecto] of Object.entries(efectos)) {
          const categoriaId = categorias.get(categoria)!;
          const perfilMovilidadId = perfiles.get(perfil)!;
          const datos =
            efecto === 'intransitable'
              ? { intransitable: true, factorPenalizacion: '1.00' }
              : { intransitable: false, factorPenalizacion: efecto.toFixed(2) };
          await tx.categoriaPerfil.upsert({
            where: { categoriaId_perfilMovilidadId: { categoriaId, perfilMovilidadId } },
            create: { categoriaId, perfilMovilidadId, ...datos },
            update: datos,
          });
        }
      }

      for (const { clave, valor, tipo, descripcion } of PARAMETROS) {
        await tx.parametroSistema.upsert({
          where: { clave },
          create: { clave, valor, tipo, descripcion },
          update: { valor, tipo, descripcion },
        });
      }

      // zona_piloto no tiene nombre único en el modelo y la geometría no la escribe Prisma: SQL a mano.
      for (const { nombre, geometria } of zonasPiloto) {
        const geojson = JSON.stringify(geometria);
        const [{ valido, motivo }] = await tx.$queryRaw<[{ valido: boolean; motivo: string }]>`
          SELECT ST_IsValid(g) AS valido, ST_IsValidReason(g) AS motivo FROM ST_GeomFromGeoJSON(${geojson}) AS g`;
        if (!valido) throw new Error(`El polígono de la zona piloto «${nombre}» no es válido: ${motivo}`);

        const actualizadas = await tx.$executeRaw`
          UPDATE zona_piloto SET geometria = ST_GeomFromGeoJSON(${geojson})::geography, activa = true
          WHERE nombre = ${nombre}`;
        if (actualizadas === 0) {
          await tx.$executeRaw`
            INSERT INTO zona_piloto (nombre, geometria) VALUES (${nombre}, ST_GeomFromGeoJSON(${geojson})::geography)`;
        }
      }

      if (usuariosPrueba) {
        for (const { email, nombre, rol, area } of USUARIOS_PRUEBA) {
          const datos = {
            nombre,
            rol,
            organismoId: rol === 'VECINO' ? null : organismo.id,
            areaId: area ? areas.get(area)! : null,
            eliminadoEn: null,
          };
          const usuario = await tx.usuario.findUnique({ where: { email } });
          if (!usuario) {
            await tx.usuario.create({
              data: { email, passwordHash: hashClavePrueba, emailVerificadoEn: new Date(), ...datos },
            });
            continue;
          }
          // El hash cambia en cada corrida (bcrypt usa una sal nueva): solo se reemplaza si la clave cambió.
          const claveIgual = await bcrypt.compare(CLAVE_USUARIOS_PRUEBA, usuario.passwordHash);
          await tx.usuario.update({
            where: { email },
            data: {
              ...datos,
              ...(claveIgual ? {} : { passwordHash: hashClavePrueba }),
              emailVerificadoEn: usuario.emailVerificadoEn ?? new Date(),
            },
          });
        }
      }

      return {
        areas: areas.size,
        categorias: categorias.size,
        perfiles: perfiles.size,
        matriz: categorias.size * perfiles.size,
        parametros: PARAMETROS.length,
        zonasPiloto: zonasPiloto.length,
        usuarios: usuariosPrueba ? USUARIOS_PRUEBA.length : 0,
      };
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}
