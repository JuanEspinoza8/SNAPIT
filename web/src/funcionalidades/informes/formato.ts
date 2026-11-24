// Los días se cuentan en hora de Argentina, como en el servidor: a las 22 h acá ya es mañana en UTC.
const diaEnArgentina = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

/** El día de hoy en Argentina, como AAAA-MM-DD. */
export const hoy = (ahora = new Date()) => diaEnArgentina.format(ahora);

/** El período que propone el formulario: del 1 del mes en curso a hoy. */
export function periodoInicial(ahora = new Date()) {
  const hasta = hoy(ahora);
  return { desde: `${hasta.slice(0, 8)}01`, hasta };
}

// Los mismos topes que el servidor (docs/api.md): así el error se ve antes de esperar a la IA.
const MAX_DIAS = 366;
const DIA_MS = 24 * 60 * 60 * 1000;

export type ErroresPeriodo = Partial<Record<'desde' | 'hasta', string>>;

export function validarPeriodo(desde: string, hasta: string): ErroresPeriodo {
  if (!desde) return { desde: 'Elegí desde cuándo' };
  if (!hasta) return { hasta: 'Elegí hasta cuándo' };
  if (Number(desde.slice(0, 4)) < 2000) return { desde: 'No puede ser anterior al 2000' };
  if (desde > hasta) return { hasta: 'No puede ser anterior a desde' };
  if (Date.parse(hasta) - Date.parse(desde) >= MAX_DIAS * DIA_MS) {
    return { hasta: `El período no puede pasar de ${MAX_DIAS} días` };
  }
  return {};
}

/** «01/10/2026». */
export const dia = (aaaammdd: string) => aaaammdd.split('-').reverse().join('/');

/** «del 01/10/2026 al 31/10/2026». */
export const periodo = ({ desde, hasta }: { desde: string; hasta: string }) =>
  `del ${dia(desde)} al ${dia(hasta)}`;

const fechaYHora = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Argentina/Buenos_Aires',
});

/** «23/11/2026, 14:05», en hora de Argentina. */
export const momento = (instante: string) => fechaYHora.format(new Date(instante));

/** El nombre del PDF, igual al que pone el servidor. */
export const nombreDelPdf = ({ desde, hasta }: { desde: string; hasta: string }) =>
  `informe-${desde}-al-${hasta}.pdf`;

export interface Seccion {
  titulo: string | null;
  parrafos: string[];
}

/**
 * Parte el contenido en sus secciones (`## Título`) y cada sección en párrafos (un renglón del orden de
 * intervención es un párrafo). Lo que viene antes del primer título va en una sección sin título.
 */
export function partirContenido(contenido: string): Seccion[] {
  const secciones: Seccion[] = [];
  for (const bloque of contenido.split(/\n{2,}/)) {
    const titulo = bloque.match(/^## (.+)$/);
    if (titulo) {
      secciones.push({ titulo: titulo[1]!.trim(), parrafos: [] });
      continue;
    }
    const parrafos = bloque
      .split('\n')
      .map((renglon) => renglon.trim())
      .filter(Boolean);
    if (parrafos.length === 0) continue;
    if (secciones.length === 0) secciones.push({ titulo: null, parrafos: [] });
    secciones.at(-1)!.parrafos.push(...parrafos);
  }
  return secciones;
}
