import { z } from 'zod';

const obligatorio = (mensaje: string) => (problema: { input: unknown }) =>
  problema.input === undefined ? 'Es obligatorio' : mensaje;

// 255: el largo de dispositivo.token_push.
export const tokenPush = z
  .string({ error: obligatorio('Tiene que ser un texto') })
  .trim()
  .min(1, { error: 'Es obligatorio' })
  .max(255, { error: 'Tiene que tener hasta 255 caracteres' });

export const esquemaDispositivo = z.object({
  tokenPush,
  plataforma: z.enum(['ANDROID', 'WEB'], { error: 'Tiene que ser ANDROID o WEB' }),
});

const nombre = z
  .string({ error: obligatorio('Tiene que ser un texto') })
  .trim()
  .min(1, { error: 'Es obligatorio' })
  .max(80, { error: 'Tiene que tener hasta 80 caracteres' });

const lat = z
  .number({ error: obligatorio('Tiene que ser un número') })
  .min(-90, { error: 'Tiene que estar entre -90 y 90' })
  .max(90, { error: 'Tiene que estar entre -90 y 90' });

const lon = z
  .number({ error: obligatorio('Tiene que ser un número') })
  .min(-180, { error: 'Tiene que estar entre -180 y 180' })
  .max(180, { error: 'Tiene que estar entre -180 y 180' });

// int32 porque la columna es int: un número más grande haría fallar la consulta con un 500.
const radioMetros = z
  .int32({ error: obligatorio('Tiene que ser un número entero de metros') })
  .positive({ error: 'Tiene que ser mayor que 0' });

const activa = z.boolean({ error: obligatorio('Tiene que ser true o false') });

// Al crearla, una zona arranca activa si no se dice otra cosa. Al editarla se manda entera: si faltara activa,
// una zona pausada se volvería a activar sin querer.
export const esquemaNuevaZona = z.object({ nombre, lat, lon, radioMetros, activa: activa.default(true) });
export const esquemaZona = z.object({ nombre, lat, lon, radioMetros, activa });

export type DatosZona = z.output<typeof esquemaZona>;
