import { z } from 'zod';

// Una pregunta vacía no es un error de forma: la decide el servicio (422), como una que no se entiende.
export const esquemaConsulta = z.object({
  texto: z
    .string({ error: 'Es obligatorio' })
    .trim()
    .max(500, { error: 'Tiene que tener hasta 500 caracteres' }),
});
