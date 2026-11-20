import { z } from 'zod';
import { fecha, finDe, inicioDe } from '../incidentes/esquemas.js';

// int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
const id = z.coerce
  .number({ error: 'Tiene que ser un número' })
  .pipe(z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' }));

// Un tope al período: la serie semanal trae una fila por semana, y un rango de siglos trabaría la consulta.
const MAX_PERIODO_MS = 3 * 366 * 24 * 60 * 60 * 1000;
const ANIO_MINIMO = 2000;

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
  .refine(({ desde }) => !desde || desde.getUTCFullYear() >= ANIO_MINIMO, {
    error: `La fecha no puede ser anterior a ${ANIO_MINIMO}`,
    path: ['desde'],
  })
  .refine(({ hasta }) => !hasta || hasta.getUTCFullYear() >= ANIO_MINIMO, {
    error: `La fecha no puede ser anterior a ${ANIO_MINIMO}`,
    path: ['hasta'],
  })
  .refine(({ desde, hasta }) => !desde || !hasta || desde <= hasta, {
    error: 'No puede ser anterior a desde',
    path: ['hasta'],
  })
  .refine(
    ({ desde, hasta }) => !desde || (hasta ?? new Date()).getTime() - desde.getTime() <= MAX_PERIODO_MS,
    {
      error: 'El período no puede pasar de 3 años',
      path: ['desde'],
    },
  );
