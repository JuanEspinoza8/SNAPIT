import { z } from 'zod';
import { type DetalleError, ErrorApp } from '../../compartido/errores.js';
import { invalidarParametros } from '../../compartido/parametros.js';
import { prisma } from '../../compartido/prisma.js';
import { validar } from '../../compartido/validar.js';
import { logger } from '../../config/logger.js';
import { revincularIncidentes } from '../red/repositorio.js';
import { problemaDelValor } from './calculo.js';

// Qué tramos obstruye cada incidente sale de este radio: si cambia, se recalculan todos.
const RADIO_OBSTRUCCION = 'ruteo.radio_obstruccion_m';

const esquemaCambios = z.object({
  parametros: z
    .array(
      z.object({
        clave: z.string({ error: 'Es obligatoria' }).min(1, { error: 'Es obligatoria' }),
        // La web puede mandar 30 o "30": se guarda como texto, igual que lo carga la semilla.
        valor: z
          .union([z.string(), z.number()], { error: 'Es obligatorio' })
          .transform((valor) => String(valor).trim()),
      }),
      { error: 'Tiene que ser una lista' },
    )
    .min(1, { error: 'No hay nada para guardar' })
    .max(200, { error: 'Son demasiados de una vez' }),
});

const campos = { clave: true, valor: true, tipo: true, descripcion: true } as const;

/** Todos los parámetros, por clave: así quedan juntos los de cada cálculo (agrupacion.*, prioridad.*…). */
export async function listar() {
  return {
    parametros: await prisma.parametroSistema.findMany({ select: campos, orderBy: { clave: 'asc' } }),
  };
}

/**
 * Guarda varios parámetros juntos: o todos o ninguno, así un grupo no queda a medias. Cada valor se valida por su
 * tipo y por la regla de su clave. Al confirmar se invalida la caché: el próximo cálculo ya usa los valores
 * nuevos, sin reiniciar el servidor.
 */
export async function guardar(cuerpo: unknown) {
  const { parametros: cambios } = validar(esquemaCambios, cuerpo ?? {});
  const claves = cambios.map((cambio) => cambio.clave);
  const repetida = claves.find((clave, i) => claves.indexOf(clave) !== i);
  if (repetida) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: repetida, mensaje: 'Viene más de una vez' },
    ]);
  }

  const { guardados, cambioElRadio } = await prisma.$transaction(async (tx) => {
    const actuales = new Map(
      (await tx.parametroSistema.findMany({ where: { clave: { in: claves } } })).map((fila) => [
        fila.clave,
        fila,
      ]),
    );
    const faltan = claves.filter((clave) => !actuales.has(clave));
    if (faltan.length > 0) {
      throw new ErrorApp(404, 'PARAMETRO_NO_ENCONTRADO', `No existe el parámetro ${faltan.join(', ')}`);
    }

    const detalles: DetalleError[] = [];
    for (const { clave, valor } of cambios) {
      const problema = problemaDelValor(clave, actuales.get(clave)!.tipo, valor);
      if (problema) detalles.push({ campo: clave, mensaje: problema });
    }
    if (detalles.length > 0) throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay valores inválidos', detalles);

    const guardados = [];
    for (const { clave, valor } of cambios) {
      guardados.push(await tx.parametroSistema.update({ where: { clave }, data: { valor }, select: campos }));
    }
    const radio = cambios.find((cambio) => cambio.clave === RADIO_OBSTRUCCION);
    return {
      guardados,
      cambioElRadio:
        radio !== undefined && Number(radio.valor) !== Number(actuales.get(RADIO_OBSTRUCCION)!.valor),
    };
  });
  invalidarParametros();

  if (cambioElRadio) {
    // Ya está guardado: si el recálculo falla, el radio nuevo vale para los incidentes que se creen.
    try {
      await revincularIncidentes(prisma);
    } catch (error) {
      logger.error({ err: error }, 'No se pudieron recalcular los tramos obstruidos con el radio nuevo');
    }
  }
  return { parametros: guardados };
}
