import { z } from 'zod';

// int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
const id = z.coerce
  .number({ error: 'Tiene que ser un número' })
  .pipe(z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' }));

// Solo el día: el período se guarda en columnas date y se toma completo, en hora de Argentina.
const dia = z.iso.date({ error: 'Tiene que ser una fecha, por ejemplo 2026-10-06' });

// Un tope al período: con más de un año el informe deja de ser un estado de situación y los datos crecen.
const MAX_DIAS = 366;
const ANIO_MINIMO = 2000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** POST /api/informes: el período es obligatorio; el área y el barrio, opcionales. */
export const esquemaPedidoInforme = z
  .object({
    desde: dia,
    hasta: dia,
    // Sin área, todo el organismo.
    areaId: id.nullish(),
    // Escrito como en GET /api/barrios.
    barrio: z
      .string({ error: 'Tiene que ser un texto' })
      .trim()
      .max(120, { error: 'No puede pasar de 120 caracteres' })
      .nullish()
      .transform((barrio) => barrio || null),
  })
  .refine(({ desde }) => Number(desde.slice(0, 4)) >= ANIO_MINIMO, {
    error: `La fecha no puede ser anterior a ${ANIO_MINIMO}`,
    path: ['desde'],
  })
  .refine(({ desde, hasta }) => desde <= hasta, { error: 'No puede ser anterior a desde', path: ['hasta'] })
  .refine(({ desde, hasta }) => Date.parse(hasta) - Date.parse(desde) < MAX_DIAS * DIA_MS, {
    error: `El período no puede pasar de ${MAX_DIAS} días`,
    path: ['hasta'],
  });

export const esquemaIdInforme = z.object({ id });
