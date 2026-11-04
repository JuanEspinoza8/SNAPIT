// Las fechas se muestran en hora de Argentina, sin depender de la zona horaria de la computadora.
const fechaLarga = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'long',
  timeZone: 'America/Argentina/Buenos_Aires',
});

/** «6 de octubre de 2026». */
export const formatearFecha = (instante: string | Date) => fechaLarga.format(new Date(instante));

/**
 * Cuánto pasó desde [instante], como en una red social: «hace 5 min», «ayer», «hace 3 días». Pasada una
 * semana, la fecha larga. Los mismos textos que haceCuanto() en mobile/lib/compartido/formato/fechas.dart.
 */
export function haceCuanto(instante: string | Date, ahora = new Date()) {
  const minutos = Math.floor((ahora.getTime() - new Date(instante).getTime()) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return formatearFecha(instante);
}
