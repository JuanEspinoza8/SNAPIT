import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { esAreaDelOrganismo } from '../bandeja/repositorio.js';
import {
  abiertosPorEstado,
  ordenarBarrios,
  pesosDeCalor,
  porcentaje,
  tiemposDeResolucion,
} from './calculo.js';
import { esquemaFiltrosIndicadores } from './esquemas.js';
import * as repositorio from './repositorio.js';

/** Los filtros de la consulta para el organismo de la sesión. Null si no tiene organismo: no hay nada que medir. */
async function filtrosDe(sesion: UsuarioSesion, consulta: unknown) {
  const { areaId, desde, hasta } = validar(esquemaFiltrosIndicadores, consulta);
  if (sesion.organismoId === null) return null;

  if (areaId && !(await esAreaDelOrganismo(areaId, sesion.organismoId))) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'areaId', mensaje: 'No es un área de tu organismo' },
    ]);
  }
  return { organismoId: sesion.organismoId, areaId, desde, hasta };
}

/** Los indicadores de gestión del organismo (F13). Cada uno está explicado en docs/api.md. */
export async function obtenerIndicadores(sesion: UsuarioSesion, consulta: unknown) {
  const filtros = await filtrosDe(sesion, consulta);
  const [abiertos, semanas, resueltos, barrios, reportes] = filtros
    ? await Promise.all([
        repositorio.contarAbiertosPorEstado(filtros),
        repositorio.contarPorSemana(filtros),
        repositorio.listarResueltos(filtros),
        repositorio.contarAbiertosPorBarrio(filtros),
        repositorio.contarReportes(filtros),
      ])
    : [[], [], [], [], { total: 0, desestimados: 0 }];

  return {
    abiertosPorEstado: abiertosPorEstado(abiertos),
    nuevosYResueltosPorSemana: semanas,
    tiempoDeResolucion: tiemposDeResolucion(resueltos),
    barriosConMasAbiertos: ordenarBarrios(barrios),
    reportesDesestimados: { ...reportes, porcentaje: porcentaje(reportes.desestimados, reportes.total) },
  };
}

/** Los incidentes abiertos para el mapa de calor, cada uno con un peso según su prioridad. */
export async function obtenerCalor(sesion: UsuarioSesion, consulta: unknown) {
  const filtros = await filtrosDe(sesion, consulta);
  const puntos = filtros ? await repositorio.listarPuntosAbiertos(filtros) : [];
  const pesos = pesosDeCalor(puntos.map((punto) => punto.prioridad));
  return { puntos: puntos.map(({ lat, lon }, indice) => ({ lat, lon, peso: pesos[indice]! })) };
}
