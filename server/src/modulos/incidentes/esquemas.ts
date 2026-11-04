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
      .pipe(z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' }))
      .optional(),
    estado: z.enum(ESTADOS_VISIBLES, { error: `Tiene que ser ${ESTADOS_VISIBLES.join(', ')}` }).optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
    // El rectángulo que se ve en el mapa: así el cliente pide solo lo que entra en pantalla.
    bbox: coordenadas.optional(),
    // El nombre tal como lo devuelve GET /api/barrios.
    barrio: z
      .string({ error: 'Tiene que ser un texto' })
      .trim()
      .min(1, { error: 'No puede estar vacío' })
      .max(250, { error: 'Puede tener hasta 250 caracteres' })
      .optional(),
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

/**
 * Dónde sigue el feed: la fecha del primer reporte y el id del último incidente de la página anterior.
 * La fecha viaja como la escribe PostgreSQL (con microsegundos), porque un Date de JavaScript los
 * redondea a milisegundos y la página siguiente podría repetir o saltear un incidente.
 */
export interface Cursor {
  fecha: string;
  id: number;
}

export const codificarCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify([cursor.fecha, cursor.id])).toString('base64url');

const cursor = z.string().transform((texto, contexto) => {
  try {
    const [fecha, id] = JSON.parse(Buffer.from(texto, 'base64url').toString()) as unknown[];
    if (typeof fecha === 'string' && !Number.isNaN(Date.parse(fecha)) && Number.isInteger(id)) {
      return { fecha, id: id as number };
    }
  } catch {
    // Cae al error de abajo: un cursor que no se puede leer es igual de inválido que uno mal armado.
  }
  contexto.addIssue({
    code: 'custom',
    message: 'No es un cursor válido: usá el campo siguiente de la página anterior',
  });
  return z.NEVER;
});

export const LIMITE_FEED = { porDefecto: 20, maximo: 50 };

// El feed acepta los mismos filtros que el mapa, más la página.
export const esquemaFeed = z
  .object({
    cursor: cursor.optional(),
    limite: z.coerce
      .number({ error: 'Tiene que ser un número' })
      .pipe(
        z
          .int({ error: 'Tiene que ser un número entero' })
          .min(1, { error: 'Tiene que ser al menos 1' })
          .max(LIMITE_FEED.maximo, { error: `Puede ser hasta ${LIMITE_FEED.maximo}` }),
      )
      .default(LIMITE_FEED.porDefecto),
  })
  .and(esquemaFiltros);

export type PedidoFeed = z.output<typeof esquemaFeed>;

// int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
export const esquemaId = z.object({
  id: z.coerce
    .number({ error: 'No es válido' })
    .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' })),
});
