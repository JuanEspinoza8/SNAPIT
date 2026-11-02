import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TipoPuntoInteres, type PrismaClient } from '@prisma/client';
import { leerRespuestaOverpass, type ClienteOverpass } from './overpass.js';
import { aPuntosInteres, CONSULTA_PUNTOS_INTERES, type Descarte } from './puntosInteres.js';
import { armarRed, consultaRed } from './redPeatonal.js';
import { guardarPuntosInteres, listarZonasActivas, reemplazarRed, type CargaRed } from './repositorio.js';

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

async function descargar(
  overpass: OpcionesImportacion['overpass'],
  consulta: string,
  archivo: string,
  queFalta: string,
) {
  const respuesta = await overpass.consultar(consulta);
  // Un área equivocada no es un error para Overpass: responde sin elementos. Así no se pisa la buena.
  if (respuesta.elementos.length === 0) throw new Error(`Overpass no devolvió ${queFalta}`);
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
  const respuesta = sinConexion
    ? await leerGuardada(archivo)
    : await descargar(overpass, CONSULTA_PUNTOS_INTERES, archivo, 'ningún punto de interés');
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

export interface ResumenRed extends CargaRed {
  origen: 'overpass' | 'archivo';
  fechaDatos: string | null;
  zonas: string[];
  /** Caminos de la respuesta que no entran en la red, con el motivo. */
  descartados: Descarte[];
}

/**
 * Trae de Overpass (o de la respuesta guardada) los caminos que tocan las zonas piloto activas, arma la red
 * peatonal y reemplaza la que había en `nodo_peatonal` y `tramo_peatonal`.
 */
export async function importarRed({
  prisma,
  archivo,
  sinConexion,
  overpass,
}: OpcionesImportacion): Promise<ResumenRed> {
  const zonas = await listarZonasActivas(prisma);
  if (zonas.length === 0) {
    throw new Error('No hay ninguna zona piloto activa: cargala primero con npm run semilla.');
  }
  const consulta = consultaRed(zonas.map((zona) => zona.geometria.coordinates[0]!));
  const respuesta = sinConexion
    ? await leerGuardada(archivo)
    : await descargar(overpass, consulta, archivo, 'ningún camino');
  const { nodos, tramos, descartados } = armarRed(respuesta.elementos);
  if (tramos.length === 0) throw new Error('La respuesta no tiene ningún camino para peatones');
  const carga = await reemplazarRed(prisma, { nodos, tramos });

  return {
    origen: sinConexion ? 'archivo' : 'overpass',
    fechaDatos: respuesta.fechaDatos,
    zonas: zonas.map((zona) => zona.nombre),
    descartados,
    ...carga,
  };
}

const cuantos = (cantidad: number, uno: string, varios: string) =>
  `${cantidad} ${cantidad === 1 ? uno : varios}`;

/** El resumen que muestra el script al terminar: qué se cargó, cuántos pedazos quedaron y qué se descartó. */
export function describirResumenRed(resumen: ResumenRed) {
  const { origen, fechaDatos, zonas, nodos, tramos, porTipo, componentes, descartados } = resumen;
  const desde = origen === 'overpass' ? 'Overpass' : 'la respuesta guardada';
  const tipos = Object.entries(porTipo).map(([tipo, cantidad]) => `${cantidad} ${tipo}`);
  const lineas = [
    `Red peatonal cargada desde ${desde}${fechaDatos ? ` (datos de OSM al ${fechaDatos})` : ''}.`,
    `Zona: ${zonas.join(', ')}`,
    '',
    `  Nodos   ${String(nodos).padStart(6)}  ${resumen.conSemaforoSonoro} con semáforo sonoro, ${resumen.conPisoPodotactil} con piso podotáctil`,
    `  Tramos  ${String(tramos).padStart(6)}  ${tipos.join(', ')}; ${resumen.conRampa} con rampa`,
  ];
  if (resumen.fueraDeZona > 0) {
    lineas.push(
      `  ${cuantos(resumen.fueraDeZona, 'tramo no toca', 'tramos no tocan')} la zona y no se cargan.`,
    );
  }

  lineas.push('');
  if (componentes.length === 1) {
    lineas.push('La red es un solo componente conexo: desde cualquier nodo se llega a cualquier otro.');
  } else {
    lineas.push(`Componentes conexos: ${componentes.length}. Desde uno no se llega a los otros:`);
    for (const [i, componente] of componentes.slice(0, 10).entries()) {
      const parte = Math.round((componente.nodos / nodos) * 100);
      lineas.push(
        `  ${i + 1}. ${cuantos(componente.nodos, 'nodo', 'nodos')} (${parte} %), por ejemplo https://www.openstreetmap.org/node/${componente.nodoOsmId}`,
      );
    }
    if (componentes.length > 10) lineas.push(`  … y ${componentes.length - 10} más`);
  }

  if (descartados.length > 0) {
    lineas.push('', `Caminos descartados (${descartados.length}):`);
    const porMotivo = new Map<string, Descarte[]>();
    for (const descarte of descartados) {
      porMotivo.set(descarte.motivo, [...(porMotivo.get(descarte.motivo) ?? []), descarte]);
    }
    for (const [motivo, lista] of porMotivo) {
      const ejemplos = lista.slice(0, 5).map((descarte) => descarte.elemento);
      lineas.push(`  ${motivo}: ${lista.length} (${ejemplos.join(', ')}${lista.length > 5 ? ', …' : ''})`);
    }
  }
  if (resumen.vinculosBorrados > 0) {
    lineas.push(
      '',
      `Se vaciaron ${cuantos(resumen.vinculosBorrados, 'vínculo', 'vínculos')} entre incidentes y tramos: hay que volver a vincular los incidentes con la red nueva.`,
    );
  }
  return lineas.join('\n');
}
