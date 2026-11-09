import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { almacenFotos } from '../../compartido/almacenFotos.js';
import { analizarFoto } from '../../compartido/analisisFoto.js';
import { ErrorApp } from '../../compartido/errores.js';
import { prisma } from '../../compartido/prisma.js';
import { validar } from '../../compartido/validar.js';
import { logger } from '../../config/logger.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { compararCierre, MAX_FOTOS_ANTES } from '../ia/compararCierre.js';
import { IaNoDisponible } from '../ia/servicio.js';
import { registrarMovimiento } from '../incidentes/bitacora.js';
import { transicionValida } from '../incidentes/calculo.js';
import { esquemaId } from '../incidentes/esquemas.js';
import { avisarCambioIncidente } from '../incidentes/eventos.js';
import { transaccion } from '../reportes/repositorio.js';
import { distanciaMetros } from '../verificacion/calculo.js';
import { type DatosDelCierre, decidirCierre, explicarCierre } from './calculo.js';
import * as repositorio from './repositorio.js';

const datosInvalidos = (mensaje: string) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo: 'foto', mensaje }]);

const urlFoto = (id: number) => ({ id, url: `/api/fotos/${id}` });

/**
 * Si el operador puede cerrar el incidente: es de su organismo, se trabaja sobre él (no está unido a otro ni
 * caducó), está en ejecución y no tiene un cierre esperando confirmación. Primero el permiso: a otro
 * organismo no se le dice en qué estado está.
 */
function exigirCerrable(incidente: repositorio.IncidenteACerrar | undefined, sesion: UsuarioSesion) {
  if (!incidente) throw new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
  if (incidente.organismoId !== sesion.organismoId) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'El incidente es de otro organismo');
  }
  if (incidente.unido) {
    throw new ErrorApp(409, 'INCIDENTE_UNIDO', 'El incidente está unido a otro: se cierra el principal');
  }
  if (incidente.caducado) {
    throw new ErrorApp(409, 'INCIDENTE_CADUCADO', 'El incidente caducó: ya no está vigente');
  }
  if (incidente.estado !== 'EN_EJECUCION') {
    throw new ErrorApp(
      409,
      'INCIDENTE_NO_EN_EJECUCION',
      `Solo se cierra un incidente en ejecución, y este está ${incidente.estado}`,
    );
  }
  if (incidente.resultadoCierre === 'OBSERVADO') {
    throw new ErrorApp(
      409,
      'CIERRE_OBSERVADO',
      'El cierre está observado: espera que otro operador lo confirme o lo rechace',
    );
  }
  return incidente;
}

/**
 * Le pide a la IA que compare el antes con el después. Nunca falla: si no hay con qué comparar o la IA no
 * responde, devuelve el motivo y el cierre queda observado (decidirCierre).
 */
async function comparar(usuarioId: number, incidenteId: number, fotoDespues: Buffer) {
  try {
    const rutas = await repositorio.fotosDelAntes(incidenteId, MAX_FOTOS_ANTES);
    if (rutas.length === 0) return { comparacion: null, sinComparacion: 'no hay fotos del antes' };
    const antes = await Promise.all(rutas.map((ruta) => readFile(almacenFotos.ubicacion(ruta))));
    return { comparacion: await compararCierre(usuarioId, antes, fotoDespues), sinComparacion: null };
  } catch (error) {
    if (error instanceof IaNoDisponible) {
      return { comparacion: null, sinComparacion: 'la IA no está disponible' };
    }
    logger.error({ err: error, incidenteId }, 'No se pudieron comparar las fotos del cierre');
    return { comparacion: null, sinComparacion: 'no se pudieron leer las fotos' };
  }
}

/**
 * El operador cierra un incidente en ejecución con la foto del después (F09):
 * - La distancia sale del GPS de la foto. Si está en el lugar, la IA compara el antes con el después.
 * - decidirCierre da el resultado. VALIDADO: el incidente pasa a RESUELTO. RECHAZADO: sigue en ejecución y
 *   se puede volver a intentar, que corrige el mismo cierre. OBSERVADO: espera que otro operador lo confirme
 *   (#109).
 * - Cada intento suma su foto (ninguna se borra) y un movimiento en la bitácora.
 */
export async function cerrarIncidente(
  sesion: UsuarioSesion,
  parametros: unknown,
  archivo: Buffer | undefined,
) {
  const { id } = validar(esquemaId, parametros);
  if (!archivo) throw datosInvalidos('Es obligatoria');
  const imagen = await analizarFoto(archivo);
  if (!imagen) throw datosInvalidos('Tiene que ser una imagen JPG o PNG');

  // Antes de consultar a la IA (que tarda y cuesta): si no se puede cerrar, no se pregunta.
  const incidente = exigirCerrable(await repositorio.leerIncidente(prisma, id, { bloquear: false }), sesion);
  const params = await repositorio.leerParametros();

  const { latitud, longitud } = imagen.exif;
  const distancia =
    latitud === null || longitud === null
      ? null
      : Number(distanciaMetros(latitud, longitud, incidente.lat, incidente.lon).toFixed(2));
  // Sin GPS o fuera del lugar, el resultado no depende de la IA: no se le pregunta.
  const enElLugar = distancia !== null && distancia <= params.distanciaMaxM;
  const { comparacion, sinComparacion } = enElLugar
    ? await comparar(sesion.id, id, archivo)
    : { comparacion: null, sinComparacion: null };

  const resultado = decidirCierre(distancia, comparacion?.veredicto ?? null, params);
  const datos: DatosDelCierre = { distancia, comparacion, sinComparacion };
  const detalle = explicarCierre(resultado, datos, params);

  // Primero el archivo y después la base, como el alta de un reporte: si la base falla, se borra el archivo.
  const rutaArchivo = await almacenFotos.guardar(archivo, imagen.tipo);
  try {
    return await transaccion(async (tx) => {
      // Se vuelve a comprobar con el incidente bloqueado: mientras la IA comparaba pudo cambiar.
      exigirCerrable(await repositorio.leerIncidente(tx, id, { bloquear: true }), sesion);

      const cierre = await repositorio.guardarCierre(tx, {
        incidenteId: id,
        usuarioId: sesion.id,
        distanciaMetros: distancia,
        resultadoComparacion: resultado,
        detalleComparacion: detalle,
        registroIaId: comparacion?.registroIaId ?? null,
      });
      await repositorio.guardarFoto(tx, cierre.id, {
        rutaArchivo,
        ancho: imagen.ancho,
        alto: imagen.alto,
        tamanoBytes: archivo.length,
        tomadaConCamaraApp: false,
        hashPerceptual: imagen.hashPerceptual,
        exifLatitud: latitud,
        exifLongitud: longitud,
        exifTomadaEn: imagen.exif.tomadaEn,
        exifMarca: imagen.exif.marca,
        exifModelo: imagen.exif.modelo,
      });

      let estado = incidente.estado;
      if (resultado === 'VALIDADO' && transicionValida('EN_EJECUCION', 'RESUELTO', 'CIERRE')) {
        const ahora = new Date();
        await tx.incidente.update({
          where: { id },
          data: { estado: 'RESUELTO', resueltoEn: ahora, actualizadoEn: ahora },
        });
        await registrarMovimiento(tx, {
          incidenteId: id,
          usuarioId: sesion.id,
          tipo: 'CAMBIO_ESTADO',
          estadoAnterior: 'EN_EJECUCION',
          estadoNuevo: 'RESUELTO',
          comentario: `Resuelto con la foto del después. ${detalle}`,
        });
        estado = 'RESUELTO';
      } else {
        await registrarMovimiento(tx, {
          incidenteId: id,
          usuarioId: sesion.id,
          tipo: 'COMENTARIO',
          comentario: `${resultado === 'RECHAZADO' ? 'Cierre rechazado' : 'Cierre observado'}. ${detalle}`,
        });
      }
      await avisarCambioIncidente(tx, id);

      return {
        incidente: { id, estado },
        cierre: {
          id: cierre.id,
          resultadoComparacion: resultado,
          distanciaMetros: distancia,
          detalleComparacion: detalle,
          fotos: (await repositorio.listarFotos(tx, cierre.id)).map(urlFoto),
        },
      };
    });
  } catch (error) {
    await almacenFotos.borrar(rutaArchivo).catch(() => {});
    throw error;
  }
}

const esquemaConfirmacion = z
  .object({
    aceptar: z.boolean({ error: 'Tiene que ser true o false' }),
    comentario: z
      .string({ error: 'Tiene que ser un texto' })
      .trim()
      .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' })
      .optional()
      .transform((texto) => texto || null),
  })
  // Quien cerró tiene que saber qué corregir para volver a intentar.
  .refine(({ aceptar, comentario }) => aceptar || comentario !== null, {
    error: 'Es obligatorio para rechazar',
    path: ['comentario'],
  });

/**
 * Otra persona del organismo (operador o administrador) confirma o rechaza un cierre observado (F09): el que la
 * foto o la IA no pudieron decidir. Nadie confirma su propio cierre, ni un administrador (decisión del 09/11).
 * - Aceptar: el cierre queda VALIDADO y el incidente pasa a RESUELTO.
 * - Rechazar (con motivo): el cierre queda RECHAZADO y el incidente sigue en ejecución, listo para otro intento.
 * En los dos casos detalle_comparacion pasa a decir quién lo decidió y por qué: es lo que muestra la ficha.
 */
export async function confirmarCierre(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { aceptar, comentario } = validar(esquemaConfirmacion, cuerpo ?? {});

  return transaccion(async (tx) => {
    const incidente = await repositorio.leerIncidente(tx, id, { bloquear: true });
    if (!incidente) throw new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
    if (incidente.organismoId !== sesion.organismoId) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'El incidente es de otro organismo');
    }
    // Lo mismo que para cerrarlo (exigirCerrable): se trabaja sobre el principal y mientras siga vigente.
    if (incidente.unido) {
      throw new ErrorApp(409, 'INCIDENTE_UNIDO', 'El incidente está unido a otro: se gestiona el principal');
    }
    if (incidente.caducado) {
      throw new ErrorApp(409, 'INCIDENTE_CADUCADO', 'El incidente caducó: ya no está vigente');
    }
    const cierre = await tx.cierreIncidente.findUnique({
      where: { incidenteId: id },
      select: { id: true, usuarioId: true, resultadoComparacion: true },
    });
    // Mientras está observado el incidente sigue en ejecución: si no, otro lo cambió (por ejemplo, lo desestimó).
    if (!cierre || cierre.resultadoComparacion !== 'OBSERVADO' || incidente.estado !== 'EN_EJECUCION') {
      throw new ErrorApp(
        409,
        'CIERRE_NO_OBSERVADO',
        'El incidente no tiene un cierre esperando confirmación',
      );
    }
    if (cierre.usuarioId === sesion.id) {
      throw new ErrorApp(
        403,
        'SIN_PERMISO',
        'El cierre lo tiene que confirmar otra persona del organismo, no quien lo hizo',
      );
    }

    const nota = comentario ? `: ${comentario}` : '';
    let movimiento;
    if (aceptar) {
      if (!transicionValida(incidente.estado, 'RESUELTO', 'CIERRE')) {
        throw new ErrorApp(
          409,
          'TRANSICION_INVALIDA',
          `Un incidente ${incidente.estado} no puede pasar a RESUELTO`,
        );
      }
      const ahora = new Date();
      await tx.incidente.update({
        where: { id },
        data: { estado: 'RESUELTO', resueltoEn: ahora, actualizadoEn: ahora },
      });
      movimiento = await registrarMovimiento(tx, {
        incidenteId: id,
        usuarioId: sesion.id,
        tipo: 'CAMBIO_ESTADO',
        estadoAnterior: incidente.estado,
        estadoNuevo: 'RESUELTO',
        comentario: `Cierre observado confirmado${nota}`,
      });
    } else {
      movimiento = await registrarMovimiento(tx, {
        incidenteId: id,
        usuarioId: sesion.id,
        tipo: 'COMENTARIO',
        comentario: `Cierre observado rechazado${nota}`,
      });
    }
    // El detalle anterior decía que esperaba confirmación: ahora dice quién lo decidió y por qué.
    const quien = movimiento.usuario?.nombre ?? 'Otro operador';
    await tx.cierreIncidente.update({
      where: { id: cierre.id },
      data: aceptar
        ? { resultadoComparacion: 'VALIDADO', detalleComparacion: `Lo confirmó ${quien}${nota || '.'}` }
        : { resultadoComparacion: 'RECHAZADO', detalleComparacion: `Lo rechazó ${quien}${nota}` },
    });
    await avisarCambioIncidente(tx, id);

    return {
      incidente: { id, estado: aceptar ? ('RESUELTO' as const) : incidente.estado },
      cierre: {
        id: cierre.id,
        resultadoComparacion: aceptar ? ('VALIDADO' as const) : ('RECHAZADO' as const),
      },
      movimiento,
    };
  });
}
