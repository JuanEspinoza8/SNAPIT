import { z } from 'zod';

export const esquemaBusqueda = z.object({
  texto: z
    .string({
      error: (problema) => (problema.input === undefined ? 'Es obligatorio' : 'Tiene que ser un texto'),
    })
    .trim()
    .min(3, { error: 'Escribí al menos 3 letras' })
    .max(200, { error: 'Puede tener hasta 200 caracteres' }),
});
