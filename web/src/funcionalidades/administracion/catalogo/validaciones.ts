// Lo que la pantalla controla antes de mandar (#169). Son las mismas reglas que el servidor
// (server/src/modulos/parametros/calculo.ts y catalogoAdmin/esquemas.ts); el servidor además aplica la regla
// propia de cada clave (por ejemplo, un radio mayor que 0) y su mensaje se muestra en el campo.

const ENTERO = /^\d+$/;
const DECIMAL = /^\d+(\.\d+)?$/;
const CON_DOS_DECIMALES = /^\d+(\.\d{1,2})?$/;

/** Un factor: un número mayor que 0 o «intransitable». */
export function problemaFactor(texto: string): string | null {
  const valor = texto.trim();
  if (valor === 'intransitable') return null;
  if (!DECIMAL.test(valor) || Number(valor) <= 0) return 'Un número mayor que 0 o «intransitable»';
  return null;
}

/**
 * El valor de un parámetro según su tipo. Ningún parámetro acepta negativos: todos son distancias, días, pesos o
 * factores. La coma no sirve para los decimales (el servidor guarda con punto).
 */
export function problemaParametro(tipo: string, texto: string): string | null {
  const valor = texto.trim();
  if (tipo === 'factor') return problemaFactor(valor);
  if (valor === '') return 'Es obligatorio';
  if (valor.startsWith('-')) return 'No puede ser negativo';
  if (tipo === 'entero') return ENTERO.test(valor) ? null : 'Tiene que ser un número entero';
  if (valor.includes(',')) return 'Con punto para los decimales, no coma';
  return DECIMAL.test(valor) ? null : 'Tiene que ser un número';
}

/** Un número con hasta dos decimales, mayor que 0 y hasta `maximo`: el peso o el factor de la matriz. */
export function problemaDosDecimales(texto: string, maximo: number): string | null {
  const valor = texto.trim().replace(',', '.');
  if (valor === '') return 'Es obligatorio';
  if (!CON_DOS_DECIMALES.test(valor)) return 'Un número con hasta dos decimales';
  const numero = Number(valor);
  if (numero <= 0) return 'Tiene que ser mayor que 0';
  if (numero > maximo) return `Tiene que ser hasta ${maximo}`;
  return null;
}

/** Una celda de la matriz: un factor de hasta 999,99 con dos decimales, o «intransitable». */
export function problemaCelda(texto: string): string | null {
  return texto.trim() === 'intransitable' ? null : problemaDosDecimales(texto, 999.99);
}

// Los parámetros, agrupados por el cálculo que los usa (el prefijo de la clave), en el orden en que pasa un
// reporte por el sistema. Las reglas de tramo de cada perfil (ruteo.<regla>.perfil_<id>) van con su perfil.
const GRUPOS: { prefijo: string; nombre: string; explica: string }[] = [
  {
    prefijo: 'verificacion',
    nombre: 'Controles del reporte',
    explica: 'Lo que se revisa de la foto al recibir un reporte: dónde y cuándo se sacó, y si está repetida.',
  },
  {
    prefijo: 'agrupacion',
    nombre: 'Agrupación de reportes',
    explica: 'Cuándo un reporte nuevo se suma a un incidente que ya existe en lugar de abrir otro.',
  },
  {
    prefijo: 'prioridad',
    nombre: 'Prioridad',
    explica:
      'Cuánto pesa cada cosa en el orden de la bandeja: la gravedad, los reportes, la antigüedad y lo que hay cerca.',
  },
  {
    prefijo: 'vigencia',
    nombre: 'Vigencia',
    explica: 'Cuánto dura un problema temporal si su categoría no dice otra cosa.',
  },
  {
    prefijo: 'cierre',
    nombre: 'Cierre',
    explica: 'Lo que se controla de la foto con la que se cierra un incidente.',
  },
  {
    prefijo: 'ruteo',
    nombre: 'Recorridos',
    explica:
      'Cómo se calcula el recorrido accesible. Lo que le cuesta cada tramo a cada perfil está en Perfiles.',
  },
];

export const esReglaDePerfil = (clave: string) => /^ruteo\.[^.]+\.perfil_\d+$/.test(clave);

export interface GrupoParametros<P> {
  prefijo: string;
  nombre: string;
  explica: string;
  parametros: P[];
}

/** Los parámetros agrupados por cálculo, sin las reglas de los perfiles. Un prefijo desconocido va al final. */
export function agruparParametros<P extends { clave: string }>(parametros: P[]): GrupoParametros<P>[] {
  const grupos = new Map<string, GrupoParametros<P>>(
    GRUPOS.map((grupo) => [grupo.prefijo, { ...grupo, parametros: [] }]),
  );
  for (const parametro of parametros) {
    if (esReglaDePerfil(parametro.clave)) continue;
    const prefijo = parametro.clave.split('.')[0]!;
    if (!grupos.has(prefijo)) grupos.set(prefijo, { prefijo, nombre: prefijo, explica: '', parametros: [] });
    grupos.get(prefijo)!.parametros.push(parametro);
  }
  return [...grupos.values()].filter((grupo) => grupo.parametros.length > 0);
}

/** El nombre de cada regla de tramo, como se lee en la pantalla. */
export const NOMBRE_REGLA: Record<string, string> = {
  escalera: 'Escalera',
  sin_rampa: 'Sin rampa',
  pendiente: 'Pendiente fuerte',
  sin_pavimentar: 'Sin pavimentar',
  angosto: 'Paso angosto',
  cruce_sin_senal: 'Cruce sin señal accesible',
};
