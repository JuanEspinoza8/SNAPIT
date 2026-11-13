import { ZONA_HORARIA } from '../../tareas/prioridadDiaria.js';
import { ESTADOS_VISIBLES } from '../incidentes/esquemas.js';

// Las funciones puras de la consulta en lenguaje natural (F15): validar lo que propuso la IA contra las listas
// que se le pasaron y explicar en palabras qué se va a buscar.

export type EstadoVisible = (typeof ESTADOS_VISIBLES)[number];

/** Lo que propone la IA, todavía sin validar. Las fechas vienen como AAAA-MM-DD. */
export interface Propuesta {
  categoria: string | null;
  estado: string | null;
  barrio: string | null;
  desde: string | null;
  hasta: string | null;
}

/** Las listas que se le pasaron a la IA: lo único que se acepta. */
export interface Listas {
  categorias: { id: number; nombre: string }[];
  barrios: string[];
}

/** Los filtros de GET /api/incidentes. El que no aplica va en null. */
export interface Filtros {
  categoriaId: number | null;
  estado: EstadoVisible | null;
  desde: string | null;
  hasta: string | null;
  barrio: string | null;
}

export interface Interpretacion {
  filtros: Filtros;
  /** Para la descripción: el nombre de la categoría elegida. */
  categoriaNombre: string | null;
  /** Lo que se descartó, explicado. */
  avisos: string[];
}

/** Para comparar lo que escribió la IA con las listas: sin mayúsculas, tildes ni espacios de más. */
export function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Un texto vacío es lo mismo que no haber propuesto nada.
const pedido = (texto: string | null) => (texto?.trim() ? texto.trim() : null);

/**
 * Se queda con lo que propuso la IA que está en las listas. Lo demás se descarta y se avisa, para que la
 * búsqueda no use algo que no existe. Las fechas ya vienen con el formato validado.
 */
export function validarPropuesta(propuesta: Propuesta, listas: Listas): Interpretacion {
  const avisos: string[] = [];

  const categoriaPedida = pedido(propuesta.categoria);
  const categoria = categoriaPedida
    ? listas.categorias.find((opcion) => normalizar(opcion.nombre) === normalizar(categoriaPedida))
    : undefined;
  if (categoriaPedida && !categoria) {
    avisos.push(`No hay una categoría «${categoriaPedida}»: no se filtra por categoría.`);
  }

  const barrioPedido = pedido(propuesta.barrio);
  const barrio = barrioPedido
    ? listas.barrios.find((opcion) => normalizar(opcion) === normalizar(barrioPedido))
    : undefined;
  if (barrioPedido && !barrio) {
    avisos.push(`No hay un barrio «${barrioPedido}» con problemas en el mapa: no se filtra por barrio.`);
  }

  const estadoPedido = pedido(propuesta.estado);
  const estado = ESTADOS_VISIBLES.find((opcion) => opcion === estadoPedido?.toUpperCase());
  if (estadoPedido && !estado) {
    avisos.push(`El estado «${estadoPedido}» no se muestra en el mapa: no se filtra por estado.`);
  }

  let { desde, hasta } = propuesta;
  // El mapa respondería 400. El formato AAAA-MM-DD se puede comparar como texto.
  if (desde && hasta && desde > hasta) {
    avisos.push('El período termina antes de empezar: no se filtra por fecha.');
    desde = null;
    hasta = null;
  }

  return {
    filtros: {
      categoriaId: categoria?.id ?? null,
      estado: estado ?? null,
      desde,
      hasta,
      barrio: barrio ?? null,
    },
    categoriaNombre: categoria?.nombre ?? null,
    avisos,
  };
}

const ETIQUETAS_ESTADO: Record<EstadoVisible, string> = {
  REGISTRADO: 'en revisión',
  VERIFICADO: 'verificado',
  DERIVADO: 'derivado',
  EN_EJECUCION: 'en ejecución',
  RESUELTO: 'resuelto',
};

// 2026-11-01 → 01/11/2026
const fechaLegible = (fecha: string) => fecha.split('-').reverse().join('/');

function describirPeriodo(desde: string | null, hasta: string | null) {
  if (desde && hasta) {
    return desde === hasta
      ? `reportados el ${fechaLegible(desde)}`
      : `reportados del ${fechaLegible(desde)} al ${fechaLegible(hasta)}`;
  }
  if (desde) return `reportados desde el ${fechaLegible(desde)}`;
  if (hasta) return `reportados hasta el ${fechaLegible(hasta)}`;
  return null;
}

/** Cómo se entendió la pregunta, con los filtros ya validados, seguido de lo que se descartó. */
export function describir({ filtros, categoriaNombre, avisos }: Interpretacion) {
  const partes = [
    categoriaNombre && `categoría ${categoriaNombre}`,
    filtros.estado && `estado ${ETIQUETAS_ESTADO[filtros.estado]}`,
    filtros.barrio && `barrio ${filtros.barrio}`,
    describirPeriodo(filtros.desde, filtros.hasta),
  ].filter(Boolean);

  const entendido =
    partes.length > 0 ? `Entendí: ${partes.join(', ')}.` : 'Entendí: todos los problemas del mapa.';
  return [entendido, ...avisos].join(' ');
}

/** La fecha de hoy en Argentina (AAAA-MM-DD) y el día de la semana, para que la IA calcule los períodos. */
export function hoyEnArgentina(ahora: Date) {
  return {
    // en-CA escribe las fechas como AAAA-MM-DD.
    fecha: new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(ahora),
    dia: new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, weekday: 'long' }).format(ahora),
  };
}
