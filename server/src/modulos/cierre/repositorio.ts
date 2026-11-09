import { type EstadoIncidente, Prisma, type ResultadoComparacion } from '@prisma/client';
import {
  type DefinicionParametros,
  leerParametrosNumericos,
  noNegativo,
} from '../../compartido/parametros.js';
import { prisma } from '../../compartido/prisma.js';
import { REPORTES_DEL_INCIDENTE } from '../incidentes/repositorio.js';
import type { FotoDelReporte } from '../reportes/repositorio.js';
import type { ParametrosCierre } from './calculo.js';

type Tx = Prisma.TransactionClient;

// El mismo valor que carga la semilla: si falta el parámetro, se decide con este.
const PARAMETROS: DefinicionParametros<keyof ParametrosCierre> = {
  distanciaMaxM: { clave: 'cierre.distancia_max_m', valor: 50, valido: noNegativo },
};

/** Los parámetros cierre.* de parametro_sistema. */
export function leerParametros(): Promise<ParametrosCierre> {
  return leerParametrosNumericos(PARAMETROS);
}

/** Lo que hace falta para decidir si el incidente se puede cerrar. */
export interface IncidenteACerrar {
  estado: EstadoIncidente;
  lat: number;
  lon: number;
  /** El del área a la que se derivó o, si no se derivó, el del área de su categoría. */
  organismoId: number;
  unido: boolean;
  caducado: boolean;
  /** El resultado del intento anterior, si hubo. */
  resultadoCierre: ResultadoComparacion | null;
}

/**
 * El incidente con su cierre anterior. Con `bloquear`, queda bloqueado hasta que termine la transacción: así
 * dos cierres a la vez no se pisan.
 */
export async function leerIncidente(cliente: Tx, id: number, { bloquear }: { bloquear: boolean }) {
  const [fila] = await cliente.$queryRaw<IncidenteACerrar[]>`
    SELECT i.estado::text AS estado,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           a.organismo_id AS "organismoId",
           i.incidente_principal_id IS NOT NULL AS unido,
           (i.caducado_en IS NOT NULL OR (i.vigente_hasta IS NOT NULL AND i.vigente_hasta <= now())) AS caducado,
           ci.resultado_comparacion::text AS "resultadoCierre"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    JOIN area a ON a.id = coalesce(i.area_id, c.area_id)
    LEFT JOIN cierre_incidente ci ON ci.incidente_id = i.id
    WHERE i.id = ${id}
    ${bloquear ? Prisma.sql`FOR UPDATE OF i` : Prisma.empty}`;
  return fila;
}

/**
 * Los archivos de las fotos del antes, de las más viejas a las más nuevas: las de los reportes no desestimados
 * del incidente y de los que se le unieron. Como mucho `cantidad`.
 */
export async function fotosDelAntes(id: number, cantidad: number) {
  const filas = await prisma.$queryRaw<{ rutaArchivo: string }[]>`
    SELECT f.ruta_archivo AS "rutaArchivo"
    FROM fotografia f
    JOIN (SELECT r.id ${REPORTES_DEL_INCIDENTE(id)}) validos ON validos.id = f.reporte_id
    ORDER BY f.id
    LIMIT ${cantidad}`;
  return filas.map((fila) => fila.rutaArchivo);
}

export interface DatosCierre {
  incidenteId: number;
  usuarioId: number;
  distanciaMetros: number | null;
  resultadoComparacion: ResultadoComparacion;
  detalleComparacion: string;
  registroIaId: number | null;
}

/**
 * Guarda el intento de cierre. Un incidente se cierra una sola vez (cierre_incidente.incidente_id es único):
 * si ya hubo un intento rechazado, se corrige ese mismo, con la fecha y el operador del nuevo intento.
 */
export function guardarCierre(tx: Tx, datos: DatosCierre) {
  const { incidenteId, ...resto } = datos;
  return tx.cierreIncidente.upsert({
    where: { incidenteId },
    create: datos,
    update: { ...resto, creadoEn: new Date() },
    select: { id: true },
  });
}

/** Suma la foto del después al cierre. Las de los intentos anteriores se conservan. */
export function guardarFoto(tx: Tx, cierreId: number, foto: FotoDelReporte) {
  return tx.fotografia.create({ data: { cierreId, ...foto }, select: { id: true } });
}

/** Las fotos del cierre, de la primera a la última. */
export async function listarFotos(tx: Tx, cierreId: number) {
  const fotos = await tx.fotografia.findMany({
    where: { cierreId },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return fotos.map((foto) => foto.id);
}
