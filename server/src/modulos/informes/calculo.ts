import type { InformeIa } from '../ia/redactarInforme.js';

/** Un incidente abierto de los más prioritarios, como va en las métricas del informe. */
export interface Prioritario {
  id: number;
  categoria: string;
  area: string;
  estado: string;
  prioridad: number;
  direccion: string | null;
  barrio: string | null;
  diasAbierto: number;
  reportes: number;
}

/** Los títulos de las secciones, en orden. El PDF (#161) y la web los usan para partir el contenido. */
export const SECCIONES = {
  estadoGeneral: 'Estado general',
  zonasCriticas: 'Zonas críticas',
  categoriasFrecuentes: 'Categorías frecuentes',
  demoras: 'Demoras',
  ordenDeIntervencion: 'Orden de intervención',
} as const;

const unDecimal = (valor: number) => valor.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/** Cómo se nombra un incidente en el orden de intervención: con sus datos, no con lo que diga la IA. */
function describir(incidente: Prioritario) {
  const lugar = incidente.direccion ?? 'sin dirección todavía';
  return `Incidente #${incidente.id}: ${incidente.categoria}, ${lugar} (prioridad ${unDecimal(incidente.prioridad)}, ${unDecimal(incidente.diasAbierto)} días abierto)`;
}

/**
 * El texto del informe: una sección por título (`## Título`), en el orden de SECCIONES. En el orden de
 * intervención solo quedan los incidentes de `prioritarios`, una vez cada uno: un id que la IA inventó o
 * repitió se descarta. Devuelve también cuántos se descartaron.
 */
export function armarContenido(informe: InformeIa, prioritarios: Prioritario[]) {
  const porId = new Map(prioritarios.map((incidente) => [incidente.id, incidente]));
  const vistos = new Set<number>();
  const orden: string[] = [];
  let descartados = 0;
  for (const { incidenteId, justificacion } of informe.ordenDeIntervencion) {
    const incidente = porId.get(incidenteId);
    if (!incidente || vistos.has(incidenteId)) {
      descartados += 1;
      continue;
    }
    vistos.add(incidenteId);
    orden.push(`${orden.length + 1}. ${describir(incidente)}. ${justificacion}`);
  }

  const secciones: [string, string][] = [
    [SECCIONES.estadoGeneral, informe.estadoGeneral],
    [SECCIONES.zonasCriticas, informe.zonasCriticas],
    [SECCIONES.categoriasFrecuentes, informe.categoriasFrecuentes],
    [SECCIONES.demoras, informe.demoras],
    [SECCIONES.ordenDeIntervencion, textoDelOrden(orden, prioritarios)],
  ];
  const contenido = secciones.map(([titulo, texto]) => `## ${titulo}\n\n${texto.trim()}`).join('\n\n');
  return { contenido, descartados };
}

// Si la IA no propuso ningún orden válido y hay abiertos, van por prioridad: no se dice que no hay nada.
function textoDelOrden(orden: string[], prioritarios: Prioritario[]) {
  if (orden.length > 0) return orden.join('\n');
  if (prioritarios.length === 0) return 'No hay incidentes abiertos para ordenar.';
  return [
    'Sin una propuesta de la IA, van de mayor a menor prioridad:',
    ...prioritarios.map((incidente, indice) => `${indice + 1}. ${describir(incidente)}.`),
  ].join('\n');
}

/** Las primeras `cantidad` filas: el informe resume, y así el pedido a la IA no crece con los datos. */
export const primeros = <T>(lista: T[], cantidad = 10) => lista.slice(0, cantidad);
