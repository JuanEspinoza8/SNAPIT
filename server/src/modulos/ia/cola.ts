import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { almacenFotos } from '../../compartido/almacenFotos.js';
import { ErrorApp } from '../../compartido/errores.js';
import { prisma } from '../../compartido/prisma.js';
import { validar } from '../../compartido/validar.js';
import { logger } from '../../config/logger.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { listarCategoriasActivas } from '../catalogo/repositorio.js';
import { avisarCambioIncidente } from '../incidentes/eventos.js';
import * as verificacion from '../verificacion/repositorio.js';
import { aplicarResultado } from '../verificacion/resultado.js';
import { clasificarImagen } from './clasificarFoto.js';
import { costoUsd } from './costos.js';
import * as repositorio from './repositorio.js';
import { IaNoDisponible } from './servicio.js';

/*
 * Cola de verificación con IA. El operador procesa los reportes pendientes de su organismo con la IA, que
 * clasifica cada foto y publica sola los reportes en los que coincide exactamente con lo que eligió el vecino
 * (categoría y gravedad) y que la verificación automática ya aprobaba: los que el modo demostración mandó a la
 * cola. Los demás quedan para revisión manual (#51), con la propuesta guardada.
 * Cada paso queda en evento_verificacion_ia: es el log que ve el operador.
 */

interface ProcesoEnCurso {
  id: string;
  total: number;
  iniciadoEn: Date;
  /** Se cumple cuando termina el procesamiento. Nunca falla: cada error queda como un evento. */
  terminado: Promise<void>;
}

// Uno por organismo a la vez. Vive en memoria: si el servidor se reinicia, el procesamiento se corta y su log
// queda como estaba (los reportes que faltaban siguen pendientes).
const enCurso = new Map<number, ProcesoEnCurso>();

const esquemaProceso = z.object({ id: z.uuid({ error: 'No es válido' }) });

function organismoDe(sesion: UsuarioSesion) {
  if (sesion.organismoId === null) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'Tu usuario no pertenece a ningún organismo');
  }
  return sesion.organismoId;
}

/**
 * Empieza a procesar la cola de pendientes del organismo de quien lo pide y responde enseguida: el
 * procesamiento sigue en segundo plano, de a un reporte por vez, y su avance se consulta con verProceso.
 */
export async function iniciarProceso(sesion: UsuarioSesion) {
  const organismoId = organismoDe(sesion);
  const actual = enCurso.get(organismoId);
  if (actual) {
    throw new ErrorApp(409, 'PROCESO_EN_CURSO', `Ya hay un procesamiento en curso (${actual.id})`);
  }
  // Se reserva el lugar antes de cualquier await: dos pedidos a la vez no arrancan dos procesamientos.
  const id = randomUUID();
  const proceso: ProcesoEnCurso = { id, total: 0, iniciadoEn: new Date(), terminado: Promise.resolve() };
  enCurso.set(organismoId, proceso);

  let pendientes: Pendiente[];
  try {
    pendientes = await verificacion.pendientesParaIa(organismoId);
  } catch (error) {
    enCurso.delete(organismoId);
    throw error;
  }
  if (pendientes.length === 0) {
    enCurso.delete(organismoId);
    throw new ErrorApp(409, 'COLA_VACIA', 'No hay reportes pendientes para procesar');
  }

  proceso.total = pendientes.length;
  proceso.terminado = procesar({ id, organismoId, usuarioId: sesion.id }, pendientes).finally(() =>
    enCurso.delete(organismoId),
  );
  return { procesoId: id, total: pendientes.length };
}

/** Para los tests: espera a que termine el procesamiento en curso. */
export async function esperarProceso(id: string) {
  for (const proceso of enCurso.values()) if (proceso.id === id) await proceso.terminado;
}

interface Contexto {
  id: string;
  organismoId: number;
  usuarioId: number;
}

type Pendiente = Awaited<ReturnType<typeof verificacion.pendientesParaIa>>[number];

async function procesar(contexto: Contexto, pendientes: Pendiente[]) {
  const nombres = new Map((await listarCategoriasActivas()).map((c) => [c.id, c.nombre]));
  const nombre = (id: number | undefined) =>
    id === undefined ? '?' : (nombres.get(id) ?? `categoría ${id}`);
  const { umbralVerificado } = await verificacion.leerParametros();
  for (const reporte of pendientes) {
    try {
      await procesarReporte(contexto, reporte, nombre, umbralVerificado);
    } catch (error) {
      // Lo inesperado (por ejemplo, la base caída) tampoco corta el resto de la cola.
      logger.error({ err: error, reporteId: reporte.id }, 'Falló el procesamiento con IA de un reporte');
      await evento(contexto, reporte.id, 'ERROR', 'Falló el procesamiento: queda en la cola manual').catch(
        () => {},
      );
    }
  }
}

const evento = (
  contexto: Contexto,
  reporteId: number,
  estado: repositorio.NuevoEvento['estado'],
  detalle: string,
  extra: Partial<repositorio.NuevoEvento> = {},
) =>
  repositorio.registrarEvento({
    procesoId: contexto.id,
    organismoId: contexto.organismoId,
    usuarioId: contexto.usuarioId,
    reporteId,
    estado,
    detalle,
    ...extra,
  });

async function procesarReporte(
  contexto: Contexto,
  reporte: Pendiente,
  nombre: (id?: number) => string,
  umbral: number,
) {
  await evento(contexto, reporte.id, 'EN_PROCESO', 'Clasificando la foto');
  if (!reporte.rutaArchivo) {
    await evento(contexto, reporte.id, 'ERROR', 'El reporte no tiene foto: queda en la cola manual');
    return;
  }

  let clasificacion;
  try {
    const foto = await readFile(almacenFotos.ubicacion(reporte.rutaArchivo));
    clasificacion = await clasificarImagen(contexto.usuarioId, foto, { conExplicacion: true });
  } catch (error) {
    const motivo =
      error instanceof IaNoDisponible
        ? `IA no disponible (${error.motivo})`
        : `No se pudo leer la foto (${error instanceof Error ? error.message : String(error)})`;
    await evento(contexto, reporte.id, 'ERROR', `${motivo}: queda en la cola manual`);
    return;
  }

  const propone = `${nombre(clasificacion.categoriaId)}, ${clasificacion.severidad}`;
  const eligio = `${nombre(reporte.categoriaId)}, ${reporte.severidad}`;
  // Si el vecino aceptó la sugerencia al cargarlo, la IA se compara con su propia propuesta: el log lo dice.
  const sugerida = reporte.sugerenciaAceptada ? ' (había aceptado la sugerencia de la IA)' : '';
  await evento(
    contexto,
    reporte.id,
    'CLASIFICADO',
    `La IA propone ${propone}; el vecino eligió ${eligio}${sugerida}.` +
      (clasificacion.explicacion ? ` ${clasificacion.explicacion}` : ''),
    {
      registroIaId: clasificacion.registroIaId,
      tokensEntrada: clasificacion.uso.entrada,
      tokensSalida: clasificacion.uso.salida,
    },
  );

  const coincide =
    clasificacion.categoriaId === reporte.categoriaId && clasificacion.severidad === reporte.severidad;
  if (!coincide) {
    await evento(
      contexto,
      reporte.id,
      'REVISION_MANUAL',
      'No coincide con lo que eligió el vecino: queda para revisión manual',
    );
    return;
  }

  // La IA no reemplaza la verificación (F04): un reporte de baja confianza (foto repetida, lejos del punto,
  // vieja...) lo decide siempre un operador, aunque la foto muestre lo que eligió el vecino.
  if (reporte.nivelConfianza < umbral) {
    const enContra = reporte.senalesEnContra.length > 0 ? ` (${reporte.senalesEnContra.join('; ')})` : '';
    await evento(
      contexto,
      reporte.id,
      'REVISION_MANUAL',
      `Coincide con lo que eligió el vecino, pero la verificación le dio ${reporte.nivelConfianza} de ` +
        `confianza y hacen falta ${umbral}${enContra}: queda para revisión manual`,
    );
    return;
  }

  const publicado = await publicar(contexto, reporte.id, reporte.nivelConfianza);
  // Si un operador lo revisó mientras tanto, no es un error de la IA: lo resolvió una persona.
  await evento(
    contexto,
    reporte.id,
    publicado ? 'PUBLICADO' : 'REVISION_MANUAL',
    publicado
      ? 'Coincide con lo que eligió el vecino y la verificación lo aprobaba: publicado'
      : 'Un operador lo revisó mientras la IA lo procesaba: queda su decisión',
  );
}

/**
 * Publica el reporte igual que una aprobación manual (#51), pero con la IA como autora en la bitácora.
 * Devuelve false si mientras tanto dejó de estar pendiente (lo revisó un operador).
 */
function publicar(contexto: Contexto, reporteId: number, nivelConfianza: number) {
  return prisma.$transaction(async (tx) => {
    const reporte = await verificacion.bloquearReporte(tx, reporteId);
    if (!reporte || reporte.estado !== 'PENDIENTE_REVISION') return false;
    await verificacion.cambiarEstadoReporte(tx, reporteId, 'VERIFICADO');
    const efecto = await aplicarResultado(tx, {
      reporteId,
      decision: 'VERIFICADO',
      operadorId: contexto.usuarioId,
      comentario: `coincide con la categoría y la gravedad que eligió el vecino, y la verificación le había dado ${nivelConfianza} de confianza`,
      porIa: true,
    });
    if (efecto.incidente) await avisarCambioIncidente(tx, efecto.incidente.id);
    return true;
  });
}

const FINALES = new Set(['PUBLICADO', 'REVISION_MANUAL', 'ERROR']);

/** El log de un procesamiento, con un resumen para comparar con el trabajo manual. */
export async function verProceso(sesion: UsuarioSesion, parametros: unknown) {
  const organismoId = organismoDe(sesion);
  const { id } = validar(esquemaProceso, parametros);
  const filas = await repositorio.eventosDelProceso(id);
  // Recién arrancado todavía no guardó ningún paso: existe igual, porque está en memoria. Si no, la web, que
  // pide el log apenas recibe el 202, vería un 404.
  const enMemoria = [...enCurso.entries()].find(([, proceso]) => proceso.id === id);
  const organismoDelProceso = filas[0]?.organismoId ?? enMemoria?.[0];
  if (organismoDelProceso === undefined) {
    throw new ErrorApp(404, 'PROCESO_NO_ENCONTRADO', 'El procesamiento no existe');
  }
  if (organismoDelProceso !== organismoId) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'El procesamiento es de otro organismo');
  }

  const actual = enMemoria?.[1];
  // El último paso de cada reporte dice en qué terminó.
  const finales = new Map<number, string>();
  for (const fila of filas) if (FINALES.has(fila.estado)) finales.set(fila.reporteId, fila.estado);
  const clasificados = filas.filter((fila) => fila.estado === 'CLASIFICADO');
  const costos = clasificados.map((fila) =>
    fila.modelo === null
      ? null
      : costoUsd(fila.modelo, { entrada: fila.tokensEntrada ?? 0, salida: fila.tokensSalida ?? 0 }),
  );
  const duraciones = clasificados.flatMap((fila) => (fila.duracionMs === null ? [] : [fila.duracionMs]));
  const contar = (estado: string) => [...finales.values()].filter((final) => final === estado).length;
  const conSugerencia = new Set(
    filas.filter((fila) => fila.sugerenciaAceptada).map((fila) => fila.reporteId),
  );

  return {
    id,
    enCurso: actual !== undefined,
    iniciadoEn: filas[0]?.creadoEn ?? actual!.iniciadoEn,
    eventos: filas.map((fila) => ({
      id: fila.id,
      creadoEn: fila.creadoEn,
      estado: fila.estado,
      detalle: fila.detalle,
      reporte: {
        id: fila.reporteId,
        categoria: { id: fila.categoriaId, nombre: fila.categoriaNombre },
        severidadDeclarada: fila.severidadDeclarada,
        foto: fila.fotoId === null ? null : { id: fila.fotoId, url: `/api/fotos/${fila.fotoId}` },
        incidenteId: fila.incidenteId,
      },
      // Para "ver la propuesta de la IA": lo que respondió, tal como quedó en registro_ia.
      propuesta:
        fila.estado === 'CLASIFICADO' && fila.propuesta
          ? {
              registroIaId: fila.registroIaId,
              categoriaId: fila.propuesta.categoriaId ?? null,
              severidad: fila.propuesta.severidad ?? null,
              explicacion: fila.propuesta.explicacion ?? null,
            }
          : null,
    })),
    resumen: {
      total: actual?.total ?? new Set(filas.map((fila) => fila.reporteId)).size,
      procesados: finales.size,
      publicados: contar('PUBLICADO'),
      // De los publicados, en cuántos el vecino había aceptado la sugerencia de la IA al cargarlo.
      publicadosConSugerencia: [...finales].filter(
        ([reporteId, final]) => final === 'PUBLICADO' && conSugerencia.has(reporteId),
      ).length,
      derivados: contar('REVISION_MANUAL'),
      errores: contar('ERROR'),
      tiempoMedioMs:
        duraciones.length === 0
          ? null
          : Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length),
      // Null si algún modelo no tiene precio cargado (ia/costos.ts).
      costoUsd: costos.some((costo) => costo === null) ? null : costos.reduce<number>((a, b) => a + b!, 0),
    },
  };
}

/** Los últimos procesamientos del organismo, para que el panel retome el que está en curso. */
export async function listarProcesos(sesion: UsuarioSesion) {
  const organismoId = organismoDe(sesion);
  const enCursoId = enCurso.get(organismoId)?.id ?? null;
  const filas = await repositorio.procesosRecientes(organismoId);
  return { procesos: filas.map((fila) => ({ ...fila, enCurso: fila.id === enCursoId })) };
}
