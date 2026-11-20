import { z } from 'zod';

export const esquemaComentario = z.object({
  texto: z
    .string({ error: 'Escribí el comentario' })
    .trim()
    .min(1, { error: 'Escribí el comentario' })
    .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' }),
});
