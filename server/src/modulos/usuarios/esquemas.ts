import { z } from 'zod';

const id = z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' });

// Lo que el usuario cambia de sí mismo. perfilMovilidadId en null vuelve a "sin perfil".
export const esquemaCambiosYo = z
  .object({
    perfilMovilidadId: id.nullable().optional(),
    notificacionesHabilitadas: z.boolean({ error: 'Tiene que ser true o false' }).optional(),
  })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), {
    error: 'Mandá perfilMovilidadId o notificacionesHabilitadas',
  });

export const esquemaPreferencias = z.object({
  preferencias: z
    .array(
      z.object({
        categoriaId: id,
        habilitada: z.boolean({ error: 'Tiene que ser true o false' }),
      }),
      { error: 'Tiene que ser una lista' },
    )
    .refine((lista) => new Set(lista.map((p) => p.categoriaId)).size === lista.length, {
      error: 'Una categoría está repetida',
    }),
});
