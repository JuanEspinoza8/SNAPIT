import { z } from 'zod';

// En un formulario multipart todos los campos llegan como texto: los números se convierten acá.
const numero = (mensaje: string) =>
  z
    .string({ error: 'Es obligatorio' })
    .trim()
    .min(1, { error: 'Es obligatorio' })
    .pipe(z.coerce.number({ error: mensaje }));

export const esquemaReporte = z.object({
  // int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
  categoriaId: numero('Tiene que ser un número').pipe(
    z.int32({ error: 'No es válida' }).positive({ error: 'No es válida' }),
  ),
  severidadDeclarada: z.enum(['LEVE', 'MODERADA', 'GRAVE'], {
    error: 'Tiene que ser LEVE, MODERADA o GRAVE',
  }),
  descripcion: z
    .string()
    .trim()
    .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' })
    .optional()
    .transform((texto) => texto || null),
  lat: numero('Tiene que ser un número').pipe(
    z
      .number()
      .min(-90, { error: 'Tiene que estar entre -90 y 90' })
      .max(90, { error: 'Tiene que estar entre -90 y 90' }),
  ),
  lon: numero('Tiene que ser un número').pipe(
    z
      .number()
      .min(-180, { error: 'Tiene que estar entre -180 y 180' })
      .max(180, { error: 'Tiene que estar entre -180 y 180' }),
  ),
  origen: z.enum(['APP_MOVIL', 'SITIO_WEB'], { error: 'Tiene que ser APP_MOVIL o SITIO_WEB' }),
  // Cuándo lo cargó el vecino: puede ser antes de llegar al servidor si estaba sin señal.
  registradoEn: z.iso
    .datetime({
      offset: true,
      error: 'Tiene que ser una fecha ISO 8601, por ejemplo 2026-10-06T14:30:00-03:00',
    })
    .transform((texto) => new Date(texto))
    .optional(),
  // z.coerce.boolean() convertiría "false" en true: se aceptan solo los dos textos.
  tomadaConCamaraApp: z
    .enum(['true', 'false'], { error: 'Tiene que ser true o false' })
    .default('false')
    .transform((texto) => texto === 'true'),
});

export type DatosReporte = z.output<typeof esquemaReporte>;

export const esquemaIdFoto = z.object({
  id: z.coerce
    .number({ error: 'No es válido' })
    .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' })),
});
