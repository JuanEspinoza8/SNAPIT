import type { EventoCola, SenalVerificacion } from './tipos.js';

/** En qué está un reporte en el procesamiento con IA, para la etiqueta de su fila. */
export type EstadoIa = 'EN_COLA' | 'ANALIZANDO' | 'PUBLICADO' | 'REVISAR' | 'DESESTIMAR' | 'ERROR';

export interface ResultadoIa {
  estado: EstadoIa;
  /** Por qué terminó así (el último paso del log): por ejemplo, qué falta para publicarlo. */
  motivo: string | null;
  /** Qué vio la IA en la foto. */
  explicacion: string | null;
}

/**
 * En qué quedó un reporte según sus pasos en el procesamiento, en orden. Sin pasos: si el procesamiento sigue y
 * la IA todavía no lo miró nunca, está en cola; si no, no tiene nada que mostrar (null). Un REVISION_MANUAL en el
 * que la IA dijo que la foto no muestra un problema de la vía pública es un «desestimar» (docs/calculos.md).
 */
export function resultadoIa(
  eventos: EventoCola[],
  { enCurso, yaAnalizado }: { enCurso: boolean; yaAnalizado: boolean },
): ResultadoIa | null {
  const ultimo = eventos.at(-1);
  if (!ultimo) return enCurso && !yaAnalizado ? { estado: 'EN_COLA', motivo: null, explicacion: null } : null;

  const analisis = eventos.findLast((evento) => evento.estado === 'CLASIFICADO')?.propuesta ?? null;
  const explicacion = analisis?.explicacion ?? null;
  const base = { motivo: ultimo.detalle, explicacion };
  switch (ultimo.estado) {
    case 'EN_PROCESO':
    case 'CLASIFICADO':
      return { estado: 'ANALIZANDO', motivo: null, explicacion };
    case 'PUBLICADO':
      return { estado: 'PUBLICADO', ...base };
    case 'ERROR':
      return { estado: 'ERROR', ...base };
    case 'REVISION_MANUAL':
      return { estado: analisis?.esProblemaViaPublica === false ? 'DESESTIMAR' : 'REVISAR', ...base };
  }
}

/** Los tres controles automáticos (F04), cada uno con su resultado y el detalle que manda el servidor. */
export interface Control {
  nombre: string;
  /** Se cumple, no se cumple o la foto no trae con qué comprobarlo. */
  resultado: 'BIEN' | 'MAL' | 'SIN_DATO';
  detalle: string | null;
}

const CONTROLES: { nombre: string; tipos: string[] }[] = [
  { nombre: 'Ubicación de la foto', tipos: ['EXIF_COINCIDE', 'EXIF_AUSENTE'] },
  { nombre: 'Antigüedad', tipos: ['FECHA_ANTIGUA'] },
  { nombre: 'Foto repetida', tipos: ['HASH_DUPLICADO'] },
];

/** Los controles en orden fijo. Un reporte sin la señal de un control (uno viejo) lo muestra sin dato. */
export function controles(senales: SenalVerificacion[]): Control[] {
  return CONTROLES.map(({ nombre, tipos }) => {
    const senal = senales.find((s) => tipos.includes(s.tipo));
    const resultado = !senal || senal.valor === 0 ? 'SIN_DATO' : senal.valor > 0 ? 'BIEN' : 'MAL';
    return { nombre, resultado, detalle: senal?.detalle ?? null };
  });
}
