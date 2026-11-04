import type { TipoTramo } from '@prisma/client';

/**
 * Cuánto le estorba algo a un perfil: un factor que multiplica el costo del tramo, o 'intransitable' si el
 * recorrido no puede pasar por ahí. Es lo mismo que guarda categoria_perfil para los incidentes.
 */
export type Efecto = number | 'intransitable';

/** Los atributos del tramo que pesan según el perfil («Atributos del tramo por perfil», docs/calculos.md). */
export const REGLAS_TRAMO = [
  'escalera',
  'sin_rampa',
  'pendiente',
  'sin_pavimentar',
  'angosto',
  'cruce_sin_senal',
] as const;

export type ReglaTramo = (typeof REGLAS_TRAMO)[number];

/** Cómo afecta cada regla a un perfil. Una regla que no está no le cambia el costo. */
export type ReglasPerfil = Partial<Record<ReglaTramo, Efecto>>;

/** La clave de parametro_sistema de una regla para un perfil, por ejemplo ruteo.escalera.perfil_1. */
export const claveRegla = (regla: ReglaTramo, perfilId: number) => `ruteo.${regla}.perfil_${perfilId}`;

/** Parámetros ruteo.* (parametro_sistema) que usa el recorrido. Los valores están en docs/calculos.md. */
export interface ParametrosRecorrido {
  /** Hasta dónde se busca el nodo de la red más cercano al origen y al destino. */
  distanciaMaxAlNodoM: number;
  velocidadMPorMin: number;
  /** Una pendiente de más de este porcentaje, subiendo o bajando, activa la regla `pendiente`. */
  pendienteMaxPorcentaje: number;
  /** Un ancho de menos de estos metros activa la regla `angosto`. */
  anchoMinM: number;
}

type Umbrales = Pick<ParametrosRecorrido, 'pendienteMaxPorcentaje' | 'anchoMinM'>;

// El vocabulario de surface en OSM. El relevamiento usa dirt, gravel, grass y unpaved.
export const SUPERFICIES_SIN_PAVIMENTAR = new Set([
  'unpaved',
  'dirt',
  'earth',
  'ground',
  'gravel',
  'fine_gravel',
  'grass',
  'sand',
  'mud',
]);

/** Lo que se sabe de un tramo para calcular cuánto cuesta recorrerlo con un perfil. */
export interface TramoParaCosto {
  costoBase: number;
  tipo: TipoTramo;
  tieneRampa: boolean;
  pendientePorcentaje: number | null;
  anchoEstimado: number | null;
  superficie: string | null;
  /** Si alguno de sus dos extremos tiene semáforo sonoro o piso podotáctil. */
  extremoConSenal: boolean;
  /** Cómo afecta al perfil cada incidente vigente que obstruye el tramo. */
  incidentes: Efecto[];
}

/** Las reglas de atributos que se activan en el tramo. Un dato que falta (null) no activa ninguna. */
export function reglasDelTramo(tramo: TramoParaCosto, umbrales: Umbrales): ReglaTramo[] {
  const reglas: ReglaTramo[] = [];
  if (tramo.tipo === 'ESCALERA') reglas.push('escalera');
  // tiene_rampa es NOT NULL: false junta "no tiene" con "nadie lo relevó". Por eso encarece y no bloquea.
  if (!tramo.tieneRampa) reglas.push('sin_rampa');
  if (
    tramo.pendientePorcentaje !== null &&
    Math.abs(tramo.pendientePorcentaje) > umbrales.pendienteMaxPorcentaje
  ) {
    reglas.push('pendiente');
  }
  if (tramo.superficie !== null && SUPERFICIES_SIN_PAVIMENTAR.has(tramo.superficie)) {
    reglas.push('sin_pavimentar');
  }
  if (tramo.anchoEstimado !== null && tramo.anchoEstimado < umbrales.anchoMinM) reglas.push('angosto');
  if (tramo.tipo === 'CRUCE' && !tramo.extremoConSenal) reglas.push('cruce_sin_senal');
  return reglas;
}

/**
 * Lo que cuesta recorrer el tramo con un perfil:
 * costo_base × (factores de sus atributos) × (factor_penalizacion de sus incidentes vigentes).
 * Devuelve null si un atributo o un incidente lo vuelve intransitable para ese perfil.
 */
export function costoDelTramo(
  tramo: TramoParaCosto,
  reglas: ReglasPerfil,
  umbrales: Umbrales,
): number | null {
  const efectos = [
    ...reglasDelTramo(tramo, umbrales).map((regla) => reglas[regla] ?? 1),
    ...tramo.incidentes,
  ];
  let costo = tramo.costoBase;
  for (const efecto of efectos) {
    if (efecto === 'intransitable') return null;
    costo *= efecto;
  }
  return costo;
}

/**
 * El valor de una regla tal como está en parametro_sistema: un número mayor que 0 o "intransitable".
 * Devuelve null si no es ninguna de las dos cosas.
 */
export function leerEfecto(valor: string): Efecto | null {
  const texto = valor.trim();
  if (texto === 'intransitable') return 'intransitable';
  const factor = Number(texto);
  return texto !== '' && Number.isFinite(factor) && factor > 0 ? factor : null;
}

/** Los minutos que se tarda en caminar esa distancia, redondeados hacia arriba. */
export function minutosCaminando(distanciaMetros: number, velocidadMPorMin: number) {
  return Math.ceil(distanciaMetros / velocidadMPorMin);
}
