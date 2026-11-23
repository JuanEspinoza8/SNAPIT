import type { Prisma } from '@prisma/client';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import { logger } from '../../config/logger.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { esAreaDelOrganismo } from '../bandeja/repositorio.js';
import { redactarInforme } from '../ia/redactarInforme.js';
import { IaNoDisponible } from '../ia/servicio.js';
import { finDe, inicioDe } from '../incidentes/esquemas.js';
import { calcularIndicadores } from '../indicadores/servicio.js';
import { armarContenido, primeros } from './calculo.js';
import { esquemaIdInforme, esquemaPedidoInforme } from './esquemas.js';
import { generarPdf, nombreDelPdf } from './pdf.js';
import * as repositorio from './repositorio.js';

const SIN_IA =
  'No se pudo generar el informe: la IA no está disponible en este momento. Probá de nuevo en unos minutos.';

function organismoDe(sesion: UsuarioSesion) {
  if (sesion.organismoId === null) {
    throw new ErrorApp(
      403,
      'SIN_ORGANISMO',
      'Tu usuario no tiene un organismo: no hay datos para un informe',
    );
  }
  return sesion.organismoId;
}

/**
 * Lo que se le manda a la IA y se guarda tal cual en informe.metricas: los filtros con sus nombres, los
 * indicadores de F13 (las listas recortadas a las primeras filas), las categorías más frecuentes y los
 * incidentes abiertos más prioritarios.
 */
async function armarMetricas(organismoId: number, pedido: ReturnType<typeof esquemaPedidoInforme.parse>) {
  const areaId = pedido.areaId ?? undefined;
  const filtros = {
    organismoId,
    areaId,
    barrio: pedido.barrio ?? undefined,
    desde: inicioDe(pedido.desde),
    hasta: finDe(pedido.hasta),
  };
  const [[organismo, area], indicadores, categoriasFrecuentes, masPrioritarios] = await Promise.all([
    repositorio.nombresDe(organismoId, areaId),
    calcularIndicadores(filtros),
    repositorio.contarPorCategoria(filtros),
    repositorio.listarMasPrioritarios(filtros),
  ]);
  const { tiempoDeResolucion: tiempos } = indicadores;

  return {
    filtros: {
      organismoId,
      organismo: organismo.nombre,
      areaId: areaId ?? null,
      area: area?.nombre ?? null,
      barrio: pedido.barrio,
      desde: pedido.desde,
      hasta: pedido.hasta,
    },
    abiertosPorEstado: indicadores.abiertosPorEstado,
    nuevosYResueltosPorSemana: indicadores.nuevosYResueltosPorSemana,
    tiempoDeResolucion: {
      porCategoria: primeros(tiempos.porCategoria),
      porArea: primeros(tiempos.porArea),
      porBarrio: primeros(tiempos.porBarrio),
    },
    barriosConMasAbiertos: primeros(indicadores.barriosConMasAbiertos),
    categoriasFrecuentes,
    reportesDesestimados: indicadores.reportesDesestimados,
    masPrioritarios,
  };
}

/**
 * Genera, guarda y devuelve un informe de estado y prioridades (F14). La IA escribe solo a partir de las
 * métricas; si no responde, 503 y no se guarda nada.
 */
export async function generar(sesion: UsuarioSesion, cuerpo: unknown) {
  const pedido = validar(esquemaPedidoInforme, cuerpo);
  const organismoId = organismoDe(sesion);
  if (pedido.areaId && !(await esAreaDelOrganismo(pedido.areaId, organismoId))) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'areaId', mensaje: 'No es un área de tu organismo' },
    ]);
  }

  const metricas = await armarMetricas(organismoId, pedido);

  let respuesta;
  try {
    respuesta = await redactarInforme(sesion.id, metricas);
  } catch (error) {
    // El motivo ya quedó en registro_ia y en el log (servicioIa).
    if (error instanceof IaNoDisponible) throw new ErrorApp(503, 'IA_NO_DISPONIBLE', SIN_IA);
    throw error;
  }

  const { contenido, descartados } = armarContenido(respuesta.informe, metricas.masPrioritarios);
  if (descartados > 0) {
    logger.warn(
      { registroIaId: respuesta.registroIaId, descartados },
      'La IA propuso incidentes que no estaban en los datos del informe: se descartaron',
    );
  }

  const informe = await repositorio.guardar({
    usuarioId: sesion.id,
    areaId: pedido.areaId ?? null,
    registroIaId: respuesta.registroIaId,
    desde: pedido.desde,
    hasta: pedido.hasta,
    contenido,
    metricas: metricas as unknown as Prisma.InputJsonValue,
  });
  return { informe: detalle(informe) };
}

/** El historial del organismo, sin el contenido. */
export async function listar(sesion: UsuarioSesion) {
  if (sesion.organismoId === null) return { informes: [] };
  const informes = await repositorio.listar(sesion.organismoId);
  return { informes: informes.map(resumen) };
}

/** Un informe completo. De otro organismo o inexistente, 404: no se dice cuál de los dos. */
export async function obtener(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaIdInforme, parametros);
  const informe = sesion.organismoId === null ? null : await repositorio.buscar(id, sesion.organismoId);
  if (!informe) throw new ErrorApp(404, 'INFORME_NO_ENCONTRADO', 'No existe el informe');
  return { informe: detalle(informe) };
}

/** El informe en PDF (#161), con el período en el nombre del archivo. */
export async function obtenerPdf(sesion: UsuarioSesion, parametros: unknown) {
  const { informe } = await obtener(sesion, parametros);
  return { nombre: nombreDelPdf(informe), pdf: await generarPdf(informe) };
}

type FilaInforme = Awaited<ReturnType<typeof repositorio.listar>>[number];

const dia = (fecha: Date) => fecha.toISOString().slice(0, 10);

function resumen(informe: FilaInforme) {
  const filtros = (informe.metricas as { filtros?: { barrio?: string | null } } | null)?.filtros;
  return {
    id: informe.id,
    desde: dia(informe.periodoDesde),
    hasta: dia(informe.periodoHasta),
    area: informe.area,
    barrio: filtros?.barrio ?? null,
    solicitante: informe.usuario,
    creadoEn: informe.creadoEn,
  };
}

function detalle(informe: FilaInforme & { contenido: string }) {
  return {
    ...resumen(informe),
    contenido: informe.contenido,
    metricas: informe.metricas,
    registroIaId: informe.registroIaId,
  };
}
