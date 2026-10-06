import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  AREAS,
  CATEGORIAS,
  CLAVE_USUARIOS_PRUEBA,
  MATRIZ_CATEGORIA_PERFIL,
  ORGANISMO,
  PARAMETROS,
  PERFILES,
  USUARIOS_PRUEBA,
} from './datos.js';

/**
 * Carga el catálogo y los usuarios de prueba. Se puede correr las veces que haga falta: cada dato se busca
 * por su nombre o clave y se actualiza si ya existe, así que nunca se duplica.
 */
export async function cargarSemilla(prisma: PrismaClient) {
  // Fuera de la transacción: bcrypt tarda y la transacción tiene un tiempo máximo.
  const hashClavePrueba = await bcrypt.hash(CLAVE_USUARIOS_PRUEBA, 10);

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

      return {
        areas: areas.size,
        categorias: categorias.size,
        perfiles: perfiles.size,
        matriz: categorias.size * perfiles.size,
        parametros: PARAMETROS.length,
        usuarios: USUARIOS_PRUEBA.length,
      };
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}
