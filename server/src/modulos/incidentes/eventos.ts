import type { Prisma } from '@prisma/client';

/**
 * Lo que tiene que pasar cuando un incidente cambia de forma que afecta su prioridad (por ejemplo, se le
 * suma un reporte). Corre dentro de la misma transacción que el cambio: si falla, no queda nada a medias.
 */
export type AlCambiarIncidente = (tx: Prisma.TransactionClient, incidenteId: number) => Promise<void>;

const suscriptos: AlCambiarIncidente[] = [];

/** El módulo de prioridad (#61) se suscribe acá para recalcular cuando cambia un incidente. */
export function alCambiarIncidente(funcion: AlCambiarIncidente) {
  suscriptos.push(funcion);
}

/** Avisa a los suscriptos, en orden, dentro de la transacción del cambio. */
export async function avisarCambioIncidente(tx: Prisma.TransactionClient, incidenteId: number) {
  for (const funcion of suscriptos) await funcion(tx, incidenteId);
}
