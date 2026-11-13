import { z } from 'zod';
import { fecha, finDe, inicioDe } from '../incidentes/esquemas.js';

// int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
const id = z.coerce
  .number({ error: 'Tiene que ser un número' })
  .pipe(z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' }));

/** El período (con el formato del mapa: una fecha sola es en hora de Argentina) y el área. Todo opcional. */
export const esquemaFiltrosIndicadores = z
  .object({
    // Sin areaId, todo el organismo.
    areaId: id.optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
  })
  .transform(({ areaId, desde, hasta }) => ({
    areaId,
    desde: desde ? inicioDe(desde) : undefined,
    hasta: hasta ? finDe(hasta) : undefined,
  }))
  .refine(({ desde, hasta }) => !desde || !hasta || desde <= hasta, {
    error: 'No puede ser anterior a desde',
    path: ['hasta'],
  });
