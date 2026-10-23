import { z } from 'zod';

/** Los estados de un incidente que el organismo tiene que atender. */
export const ESTADOS_BANDEJA = ['VERIFICADO', 'DERIVADO', 'EN_EJECUCION'] as const;

// int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
const id = z.coerce
  .number({ error: 'Tiene que ser un número' })
  .pipe(z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' }));

export const esquemaFiltrosBandeja = z.object({
  // Sin areaId, la del operador. "todas" pide todo el organismo.
  areaId: z.union([z.literal('todas'), id], { error: 'Tiene que ser el id de un área o "todas"' }).optional(),
  estado: z.enum(ESTADOS_BANDEJA, { error: `Tiene que ser ${ESTADOS_BANDEJA.join(', ')}` }).optional(),
  categoriaId: id.optional(),
});
