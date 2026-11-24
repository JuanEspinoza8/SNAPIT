import { z } from 'zod';
import { nombre } from '../auth/esquemas.js';

const id = z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' });

// Lo que el usuario cambia de sí mismo. perfilMovilidadId en null vuelve a "sin perfil". El nombre es el
// visible, el que se edita en el perfil; el correo no se cambia, porque es con lo que se ingresa.
export const esquemaCambiosYo = z
  .object({
    nombre: nombre.optional(),
    perfilMovilidadId: id.nullable().optional(),
    notificacionesHabilitadas: z.boolean({ error: 'Tiene que ser true o false' }).optional(),
  })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), {
    error: 'Mandá nombre, perfilMovilidadId o notificacionesHabilitadas',
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
