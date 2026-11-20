import type { Categoria, EstadoIncidente, TipoVigencia } from '@prisma/client';

/**
 * Quién hace el cambio de estado:
 * - OPERADOR: una acción del operador sobre el incidente (derivar, pasar a ejecución, desestimar).
 * - REPORTES: la regla de estado según los reportes (estadoSegunReportes), al revisar, unir o separar.
 * - CIERRE: el cierre con la foto del después (corte 75 %).
 */
export type ViaTransicion = 'OPERADOR' | 'REPORTES' | 'CIERRE';

/**
 * El diagrama de estados del incidente (§6 del plan): desde cada estado, a cuál se puede pasar y por qué vía.
 * RESUELTO y DESESTIMADO no tienen salida. DERIVADO → DERIVADO es re-derivar a otra área.
 */
const TRANSICIONES: Record<EstadoIncidente, Partial<Record<EstadoIncidente, ViaTransicion[]>>> = {
  REGISTRADO: { VERIFICADO: ['REPORTES'], DESESTIMADO: ['REPORTES', 'OPERADOR'] },
  // A REGISTRADO vuelve solo cuando se le separa o desune el único reporte verificado (decisión del 21/10).
  VERIFICADO: { REGISTRADO: ['REPORTES'], DERIVADO: ['OPERADOR'], DESESTIMADO: ['REPORTES', 'OPERADOR'] },
  DERIVADO: { DERIVADO: ['OPERADOR'], EN_EJECUCION: ['OPERADOR'], DESESTIMADO: ['OPERADOR'] },
  EN_EJECUCION: { RESUELTO: ['CIERRE'], DESESTIMADO: ['OPERADOR'] },
  RESUELTO: {},
  DESESTIMADO: {},
};

/** Si el incidente puede pasar de `desde` a `hacia` por esa vía. */
export function transicionValida(desde: EstadoIncidente, hacia: EstadoIncidente, via: ViaTransicion) {
  return TRANSICIONES[desde][hacia]?.includes(via) ?? false;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export interface Vigencia {
  tipoVigencia: TipoVigencia;
  vigenteHasta: Date | null;
}

/**
 * La vigencia que toma un incidente de la categoría (§7.6), contada desde `desde`: al nacer o al cambiarle la
 * categoría. Un temporal (por ejemplo, una obra) vence a los días de su categoría, o a `diasPorDefecto` si
 * ella no los define. Un permanente no vence. Como las dos columnas salen juntas de acá, un temporal siempre
 * tiene vencimiento (el CHECK incidente_temporal_con_vencimiento).
 */
export function vigenciaSegunCategoria(
  categoria: Pick<Categoria, 'tipoVigenciaDefault' | 'diasCaducidadDefault'>,
  desde: Date,
  diasPorDefecto: number,
): Vigencia {
  if (categoria.tipoVigenciaDefault !== 'TEMPORAL') {
    return { tipoVigencia: categoria.tipoVigenciaDefault, vigenteHasta: null };
  }
  return { tipoVigencia: 'TEMPORAL', vigenteHasta: vencimiento(categoria, desde, diasPorDefecto) };
}

/**
 * La vigencia después de que un vecino confirma que el problema sigue (§7.6): un temporal pasa a vencer a los
 * días de su categoría contados desde `ahora`, salvo que ya venciera más tarde, porque confirmar nunca acorta
 * la vigencia. Un permanente queda igual. Decide el tipo del incidente, no el que la categoría da a los nuevos.
 */
export function vigenciaRenovada(
  vigencia: Vigencia,
  categoria: Pick<Categoria, 'diasCaducidadDefault'>,
  ahora: Date,
  diasPorDefecto: number,
): Vigencia {
  if (vigencia.tipoVigencia !== 'TEMPORAL') return vigencia;
  const renovada = vencimiento(categoria, ahora, diasPorDefecto);
  const actual = vigencia.vigenteHasta;
  return { tipoVigencia: 'TEMPORAL', vigenteHasta: actual && actual > renovada ? actual : renovada };
}

/** Cuándo vence un temporal contado desde `desde`: a los días de su categoría o, si no tiene, a los por defecto. */
function vencimiento(
  categoria: Pick<Categoria, 'diasCaducidadDefault'>,
  desde: Date,
  diasPorDefecto: number,
) {
  const dias = categoria.diasCaducidadDefault ?? diasPorDefecto;
  return new Date(desde.getTime() + dias * DIA_MS);
}
