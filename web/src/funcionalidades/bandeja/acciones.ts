import type { EstadoIncidente, FichaGestion } from './tipos.js';

export interface AccionesValidas {
  derivar: boolean;
  pasarAEjecucion: boolean;
  desestimar: boolean;
  cambiarCategoria: boolean;
  fijarPrioridad: boolean;
  quitarPrioridad: boolean;
  comentar: boolean;
}

type DatosFicha = Pick<
  FichaGestion,
  'estado' | 'incidentePrincipalId' | 'caducadoEn' | 'vigenteHasta' | 'prioridad'
>;

const CERRADOS: EstadoIncidente[] = ['RESUELTO', 'DESESTIMADO'];
const AJUSTABLES: EstadoIncidente[] = ['VERIFICADO', 'DERIVADO', 'EN_EJECUCION'];

/** Caducó, o es temporal y ya venció su vigencia aunque la tarea diaria todavía no lo marcó. */
export function estaCaducado(ficha: Pick<FichaGestion, 'caducadoEn' | 'vigenteHasta'>, ahora: Date) {
  return ficha.caducadoEn !== null || (ficha.vigenteHasta !== null && new Date(ficha.vigenteHasta) <= ahora);
}

/**
 * Qué puede hacer el operador con el incidente, con las mismas reglas que el servidor (docs/api.md y
 * «Transiciones de estado del incidente» en docs/calculos.md). Así la ficha solo ofrece lo que se va a aceptar.
 */
export function accionesValidas(ficha: DatosFicha, ahora = new Date()): AccionesValidas {
  // Unido a otro o caducado: se gestiona el principal, o ya no hay nada que gestionar.
  const gestionable = ficha.incidentePrincipalId === null && !estaCaducado(ficha, ahora);
  const abierto = gestionable && !CERRADOS.includes(ficha.estado);
  return {
    derivar: gestionable && (ficha.estado === 'VERIFICADO' || ficha.estado === 'DERIVADO'),
    pasarAEjecucion: gestionable && ficha.estado === 'DERIVADO',
    // El operador puede desestimar desde cualquier estado abierto, también en revisión.
    desestimar: abierto,
    cambiarCategoria: abierto,
    fijarPrioridad: gestionable && AJUSTABLES.includes(ficha.estado),
    // Se puede quitar aunque el incidente haya vuelto a REGISTRADO.
    quitarPrioridad: abierto && ficha.prioridad.prioridadManual !== null,
    comentar: true,
  };
}

/** Por qué el incidente no se puede gestionar, para explicarlo en la ficha. Null si se puede. */
export function motivoSinGestion(ficha: DatosFicha, ahora = new Date()): string | null {
  if (ficha.incidentePrincipalId !== null) {
    return `Está unido al incidente #${ficha.incidentePrincipalId}: se gestiona desde ese.`;
  }
  if (estaCaducado(ficha, ahora)) return 'Caducó: ya no está vigente.';
  if (ficha.estado === 'RESUELTO') return 'Está resuelto.';
  if (ficha.estado === 'DESESTIMADO') return 'Está desestimado.';
  return null;
}
