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

// Filtros de GET /api/reportes. En la URL todo llega como texto.
export const esquemaFiltrosReportes = z.object({
  estado: z
    .enum(['PENDIENTE_REVISION', 'VERIFICADO', 'DESESTIMADO'], {
      error: 'Tiene que ser PENDIENTE_REVISION, VERIFICADO o DESESTIMADO',
    })
    .optional(),
  categoriaId: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .pipe(z.int32({ error: 'No es válida' }).positive({ error: 'No es válida' }))
    .optional(),
  limite: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .pipe(
      z
        .int({ error: 'Tiene que ser entre 1 y 500' })
        .min(1, { error: 'Tiene que ser entre 1 y 500' })
        .max(500, { error: 'Tiene que ser entre 1 y 500' }),
    )
    .default(200),
});
