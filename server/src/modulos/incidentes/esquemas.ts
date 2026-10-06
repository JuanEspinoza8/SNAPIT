import { z } from 'zod';

// Los estados que se ven en el mapa. DESESTIMADO nunca se muestra, así que tampoco se puede filtrar por él.
export const ESTADOS_VISIBLES = ['REGISTRADO', 'VERIFICADO', 'DERIVADO', 'EN_EJECUCION', 'RESUELTO'] as const;

/** Acepta "2026-10-06" o una fecha con hora ISO 8601. */
const fecha = z.union([z.iso.date(), z.iso.datetime({ offset: true })], {
  error: 'Tiene que ser una fecha, por ejemplo 2026-10-06',
});

const FORMATO_BBOX = 'Tiene que ser oeste,sur,este,norte, por ejemplo -68.1,-38.97,-68.03,-38.93';

// Se valida como un solo campo: un error por cada número ("bbox.0", "bbox.1"...) confunde más que ayuda.
const coordenadas = z
  .string()
  .refine(
    (texto) => {
      const partes = texto.split(',');
      return (
        partes.length === 4 && partes.every((parte) => parte.trim() !== '' && Number.isFinite(Number(parte)))
      );
    },
    { error: FORMATO_BBOX },
  )
  .transform((texto) => texto.split(',').map(Number) as [number, number, number, number])
  .pipe(
    z
      .custom<[number, number, number, number]>()
      .refine(
        ([oeste, sur, este, norte]) =>
          oeste >= -180 && este <= 180 && sur >= -90 && norte <= 90 && oeste < este && sur < norte,
        { error: 'Fuera de rango: oeste < este (entre -180 y 180) y sur < norte (entre -90 y 90)' },
      ),
  );

export const esquemaFiltros = z
  .object({
    categoriaId: z.coerce
      .number({ error: 'Tiene que ser un número' })
      .int({ error: 'Tiene que ser un número entero' })
      .positive({ error: 'Tiene que ser un número entero' })
      .optional(),
    estado: z.enum(ESTADOS_VISIBLES, { error: `Tiene que ser ${ESTADOS_VISIBLES.join(', ')}` }).optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
    // El rectángulo que se ve en el mapa: así el cliente pide solo lo que entra en pantalla.
    bbox: coordenadas.optional(),
  })
  .transform(({ desde, hasta, bbox, ...resto }) => ({
    ...resto,
    desde: desde ? inicioDe(desde) : undefined,
    hasta: hasta ? finDe(hasta) : undefined,
    bbox: bbox ? { oeste: bbox[0], sur: bbox[1], este: bbox[2], norte: bbox[3] } : undefined,
  }))
  .refine(({ desde, hasta }) => !desde || !hasta || desde <= hasta, {
    error: 'No puede ser anterior a desde',
    path: ['hasta'],
  });

export type Filtros = z.output<typeof esquemaFiltros>;

// Una fecha sola se toma en hora de Argentina: "desde" arranca a las 0:00 y "hasta" incluye todo ese día.
const soloFecha = /^\d{4}-\d{2}-\d{2}$/;
const inicioDe = (texto: string) => new Date(soloFecha.test(texto) ? `${texto}T00:00:00-03:00` : texto);
const finDe = (texto: string) =>
  soloFecha.test(texto)
    ? new Date(new Date(`${texto}T00:00:00-03:00`).getTime() + 86_400_000 - 1)
    : new Date(texto);

export const esquemaId = z.object({
  id: z.coerce.number({ error: 'No es válido' }).int().positive({ error: 'No es válido' }),
});
