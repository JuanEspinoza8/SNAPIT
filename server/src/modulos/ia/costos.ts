/**
 * Precio de cada modelo, en dólares por millón de tokens (entrada y salida), según la lista de precios de
 * Anthropic al 20/10/2026. Si se cambia IA_MODELO por uno que no está acá, el costo queda sin calcular.
 * Haiku 5.5 cobra más cuando la consulta pasa los 100.000 tokens; una clasificación usa menos de 3.000.
 */
const PRECIOS_USD_POR_MILLON: Record<string, { entrada: number; salida: number }> = {
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
  'claude-opus-5-5': { entrada: 4, salida: 20 },
};

/**
 * Lo que costó una consulta, en dólares. Null si no se conoce el precio del modelo. `modelo` es el que
 * devolvió la API, que puede traer la fecha de la versión al final (claude-haiku-5-5-AAAAMMDD).
 */
export function costoUsd(modelo: string, tokens: { entrada: number; salida: number }) {
  const precio =
    PRECIOS_USD_POR_MILLON[modelo] ??
    Object.entries(PRECIOS_USD_POR_MILLON).find(([clave]) => modelo.startsWith(`${clave}-`))?.[1];
  if (!precio) return null;
  return (tokens.entrada * precio.entrada + tokens.salida * precio.salida) / 1_000_000;
}
