export const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const fechaHora = (fecha: string) =>
  new Date(fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

// Con un decimal, como los detalles que escribe el servidor («+6,3»): así el número y el texto coinciden.
export const numeroCorto = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
