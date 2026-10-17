import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TipoPuntoInteres, type PrismaClient } from '@prisma/client';
import { leerRespuestaOverpass, type ClienteOverpass } from './overpass.js';
import { aPuntosInteres, CONSULTA_PUNTOS_INTERES, type Descarte } from './puntosInteres.js';
import { guardarPuntosInteres } from './repositorio.js';

export interface OpcionesImportacion {
  prisma: PrismaClient;
  /** Dónde se guarda la respuesta de Overpass, para poder cargarla de nuevo sin conexión. */
  archivo: string;
  /** Carga la respuesta guardada en vez de pedirla a Overpass. */
  sinConexion: boolean;
  overpass: Pick<ClienteOverpass, 'consultar'>;
}

export interface ResumenImportacion {
  origen: 'overpass' | 'archivo';
  fechaDatos: string | null;
  porTipo: Record<TipoPuntoInteres, { nuevos: number; actualizados: number }>;
  descartados: Descarte[];
  /** Puntos de la base que no vinieron en esta carga. No se borran. */
  ausentes: number;
}

async function leerGuardada(archivo: string) {
  let texto: string;
  try {
    texto = await readFile(archivo, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const mensaje = `No hay una respuesta guardada en ${archivo}. Corré el script con conexión para descargarla.`;
      throw new Error(mensaje, { cause: error });
    }
    throw error;
  }
  return leerRespuestaOverpass(texto);
}

async function descargar(overpass: OpcionesImportacion['overpass'], archivo: string) {
  const respuesta = await overpass.consultar(CONSULTA_PUNTOS_INTERES);
  // Un área equivocada no es un error para Overpass: responde sin elementos. Así no se pisa la buena.
  if (respuesta.elementos.length === 0) throw new Error('Overpass no devolvió ningún punto de interés');
  // Se guarda recién cuando la respuesta está completa y antes de tocar la base.
  await mkdir(path.dirname(archivo), { recursive: true });
  await writeFile(archivo, respuesta.texto);
  return respuesta;
}

/** Trae los puntos de Overpass (o de la respuesta guardada) y los carga en `punto_interes` sin duplicar. */
export async function importarPuntosInteres({
  prisma,
  archivo,
  sinConexion,
  overpass,
}: OpcionesImportacion): Promise<ResumenImportacion> {
  const respuesta = sinConexion ? await leerGuardada(archivo) : await descargar(overpass, archivo);
  const { puntos, descartados } = aPuntosInteres(respuesta.elementos);
  const { yaEstaban, ausentes } = await guardarPuntosInteres(prisma, puntos);

  const porTipo = Object.fromEntries(
    Object.values(TipoPuntoInteres).map((tipo) => [tipo, { nuevos: 0, actualizados: 0 }]),
  ) as ResumenImportacion['porTipo'];
  for (const punto of puntos) {
    porTipo[punto.tipo][yaEstaban.has(punto.osmId) ? 'actualizados' : 'nuevos']++;
  }

  return {
    origen: sinConexion ? 'archivo' : 'overpass',
    fechaDatos: respuesta.fechaDatos,
    porTipo,
    descartados,
    ausentes,
  };
}

/** El resumen que muestra el script al terminar: cuántos puntos de cada tipo cargó. */
export function describirResumen({ origen, fechaDatos, porTipo, descartados, ausentes }: ResumenImportacion) {
  const fila = (columnas: (string | number)[]) =>
    '  ' +
    String(columnas[0]).padEnd(18) +
    String(columnas[1]).padStart(7) +
    String(columnas[2]).padStart(14) +
    String(columnas[3]).padStart(7);
  const conteos = Object.entries(porTipo);
  const nuevos = conteos.reduce((suma, [, c]) => suma + c.nuevos, 0);
  const actualizados = conteos.reduce((suma, [, c]) => suma + c.actualizados, 0);

  const desde = origen === 'overpass' ? 'Overpass' : 'la respuesta guardada';
  const lineas = [
    `Puntos de interés cargados desde ${desde}${fechaDatos ? ` (datos de OSM al ${fechaDatos})` : ''}:`,
    '',
    fila(['Tipo', 'Nuevos', 'Actualizados', 'Total']),
    ...conteos.map(([tipo, c]) => fila([tipo, c.nuevos, c.actualizados, c.nuevos + c.actualizados])),
    fila(['Total', nuevos, actualizados, nuevos + actualizados]),
  ];
  if (descartados.length > 0) {
    lineas.push('', `Descartados (${descartados.length}):`);
    lineas.push(...descartados.map(({ elemento, motivo }) => `  ${elemento}: ${motivo}`));
  }
  if (ausentes > 0) {
    lineas.push(
      '',
      ausentes === 1
        ? '1 punto de la base no vino en esta carga. No se borra.'
        : `${ausentes} puntos de la base no vinieron en esta carga. No se borran.`,
    );
  }
  return lineas.join('\n');
}
