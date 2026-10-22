import { type EstadoIncidente, Prisma } from '@prisma/client';
import {
  type DefinicionParametros,
  leerParametrosNumericos,
  noNegativo,
  positivo,
} from '../../compartido/parametros.js';
import type { ParametrosPrioridad, PuntoCercano, ResultadoPrioridad } from './calculo.js';

// Los mismos valores que carga la semilla: si falta un parámetro, se calcula igual con estos. Los topes
// dividen, así que tienen que ser positivos; un peso o un factor en 0 apaga esa parte.
const PARAMETROS: DefinicionParametros<keyof ParametrosPrioridad> = {
  pesoSeveridad: { clave: 'prioridad.peso_severidad', valor: 40, valido: noNegativo },
  pesoEvidencias: { clave: 'prioridad.peso_evidencias', valor: 25, valido: noNegativo },
  topeEvidencias: { clave: 'prioridad.tope_evidencias', valor: 15, valido: positivo },
  pesoAntiguedad: { clave: 'prioridad.peso_antiguedad', valor: 20, valido: noNegativo },
  topeAntiguedadDias: { clave: 'prioridad.tope_antiguedad_dias', valor: 60, valido: positivo },
  pesoContexto: { clave: 'prioridad.peso_contexto', valor: 15, valido: noNegativo },
  radioContextoM: { clave: 'prioridad.radio_contexto_m', valor: 150, valido: noNegativo },
  factorEscuela: { clave: 'prioridad.factor_escuela', valor: 1, valido: noNegativo },
  factorCentroSalud: { clave: 'prioridad.factor_centro_salud', valor: 1, valido: noNegativo },
  factorParada: { clave: 'prioridad.factor_parada', valor: 0.6, valido: noNegativo },
  factorEdificioPublico: { clave: 'prioridad.factor_edificio_publico', valor: 0.5, valido: noNegativo },
};

/** Los parámetros prioridad.* de parametro_sistema, leídos dentro de la transacción. */
export function leerParametros(tx: Prisma.TransactionClient): Promise<ParametrosPrioridad> {
  return leerParametrosNumericos(PARAMETROS, tx);
}

export function leerIncidente(tx: Prisma.TransactionClient, id: number) {
  return tx.incidente.findUnique({
    where: { id },
    select: {
      estado: true,
      severidad: true,
      cantidadReportes: true,
      primerReporteEn: true,
      prioridadManual: true,
      motivoPrioridadManual: true,
      categoria: { select: { nombre: true, pesoSeveridadBase: true } },
      ajustadaPor: { select: { nombre: true } },
    },
  });
}

/**
 * Vecinos distintos que confirmaron el incidente o alguno de los que se le unieron: el mismo criterio que
 * REPORTES_DEL_INCIDENTE. Un vecino que confirmó los dos antes de unirlos cuenta una vez.
 */
export async function contarConfirmaciones(tx: Prisma.TransactionClient, id: number) {
  const [fila] = await tx.$queryRaw<{ cantidad: bigint }[]>`
    SELECT count(DISTINCT c.usuario_id) AS cantidad
    FROM confirmacion_incidente c
    JOIN incidente i ON i.id = c.incidente_id
    WHERE i.id = ${id} OR i.incidente_principal_id = ${id}`;
  return Number(fila?.cantidad ?? 0);
}

/** El punto de interés más cercano de cada tipo a menos de `radioM` metros del incidente. */
export function puntosCercanos(tx: Prisma.TransactionClient, id: number, radioM: number) {
  // Sobre geography, distancias y radio van en metros, y ST_DWithin usa el índice GIST de punto_interes.
  return tx.$queryRaw<PuntoCercano[]>`
    SELECT DISTINCT ON (p.tipo)
           p.tipo::text AS tipo,
           p.nombre,
           ST_Distance(p.ubicacion, i.ubicacion) AS "distanciaM"
    FROM incidente i
    JOIN punto_interes p ON ST_DWithin(p.ubicacion, i.ubicacion, ${radioM})
    WHERE i.id = ${id}
    ORDER BY p.tipo, ST_Distance(p.ubicacion, i.ubicacion), p.id`;
}

/**
 * Guarda el puntaje y reemplaza el desglose. Es el único borrado del sistema (decisión del 01/10):
 * factor_prioridad no tiene fecha, así que acumular filas dejaría ambiguo cuál es el desglose vigente.
 */
export async function guardarPrioridad(
  tx: Prisma.TransactionClient,
  id: number,
  resultado: ResultadoPrioridad,
) {
  await tx.factorPrioridad.deleteMany({ where: { incidenteId: id } });
  await tx.factorPrioridad.createMany({
    data: resultado.factores.map((factor) => ({ incidenteId: id, ...factor })),
  });
  // Sin tocar actualizado_en: la prioridad es un dato derivado, y el recálculo diario la cambia sola.
  await tx.incidente.update({ where: { id }, data: { puntajePrioridad: resultado.puntaje } });
}

/**
 * La prioridad con la que se ordena: la que fijó un operador o, si no hay, la calculada. Va con el alias
 * `i`. La usa la bandeja (#64).
 */
export const PRIORIDAD_EFECTIVA = Prisma.sql`coalesce(i.prioridad_manual, i.puntaje_prioridad)`;

export interface IncidenteParaAjustar {
  estado: EstadoIncidente;
  caducado: boolean;
  unido: boolean;
  /** El del área a la que se derivó o, si todavía no se derivó, el del área de su categoría. */
  organismoId: number;
  prioridadManual: number | null;
}

/**
 * El incidente bloqueado hasta que termine la transacción. Un reporte que se suma a la vez espera, y su
 * recálculo ya ve el ajuste nuevo.
 */
export async function bloquearIncidente(tx: Prisma.TransactionClient, id: number) {
  const [fila] = await tx.$queryRaw<IncidenteParaAjustar[]>`
    SELECT i.estado::text AS estado,
           (i.caducado_en IS NOT NULL OR (i.vigente_hasta IS NOT NULL AND i.vigente_hasta <= now())) AS caducado,
           i.incidente_principal_id IS NOT NULL AS unido,
           a.organismo_id AS "organismoId",
           i.prioridad_manual::float8 AS "prioridadManual"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    JOIN area a ON a.id = coalesce(i.area_id, c.area_id)
    WHERE i.id = ${id}
    FOR UPDATE OF i`;
  return fila;
}

export function guardarAjuste(
  tx: Prisma.TransactionClient,
  id: number,
  ajuste: { valor: number; motivo: string; usuarioId: number } | null,
) {
  return tx.incidente.update({
    where: { id },
    data: {
      prioridadManual: ajuste?.valor ?? null,
      motivoPrioridadManual: ajuste?.motivo ?? null,
      ajustadaPorId: ajuste?.usuarioId ?? null,
      actualizadoEn: new Date(),
    },
  });
}

/** La prioridad del incidente con su desglose, en el orden en que se calculó. */
export async function leerPrioridad(tx: Prisma.TransactionClient, id: number) {
  const incidente = await tx.incidente.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      puntajePrioridad: true,
      prioridadManual: true,
      motivoPrioridadManual: true,
      ajustadaPor: { select: { id: true, nombre: true } },
      factorPrioridades: { select: { factor: true, valor: true, detalle: true }, orderBy: { id: 'asc' } },
    },
  });
  // Prisma devuelve los numeric como Decimal, que en el JSON saldrían como texto.
  return {
    id: incidente.id,
    puntajePrioridad: Number(incidente.puntajePrioridad),
    prioridadManual: incidente.prioridadManual === null ? null : Number(incidente.prioridadManual),
    motivoPrioridadManual: incidente.motivoPrioridadManual,
    ajustadaPor: incidente.ajustadaPor,
    factores: incidente.factorPrioridades.map((f) => ({ ...f, valor: Number(f.valor) })),
  };
}
