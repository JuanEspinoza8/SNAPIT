import { z } from 'zod';

export const esquemaIdReporte = z.object({
  id: z.coerce
    .number({ error: 'No es válido' })
    .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' })),
});

export const esquemaRevision = z.object({
  decision: z.enum(['VERIFICADO', 'DESESTIMADO'], { error: 'Tiene que ser VERIFICADO o DESESTIMADO' }),
  comentario: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' })
    .optional()
    .transform((texto) => texto || null),
});
