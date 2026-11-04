import { z } from 'zod';

const FORMATO_PUNTO = 'Tiene que ser lat,lon, por ejemplo -38.9590,-68.0870';

// Se valida como un solo campo, igual que el bbox del mapa: un error por cada número confunde más que ayuda.
const punto = z
  .string({ error: (problema) => (problema.input === undefined ? 'Es obligatorio' : FORMATO_PUNTO) })
  .refine(
    (texto) => {
      const partes = texto.split(',');
      return (
        partes.length === 2 && partes.every((parte) => parte.trim() !== '' && Number.isFinite(Number(parte)))
      );
    },
    { error: FORMATO_PUNTO },
  )
  .transform((texto) => {
    const [lat, lon] = texto.split(',').map(Number) as [number, number];
    return { lat, lon };
  })
  .pipe(
    z
      .custom<{ lat: number; lon: number }>()
      .refine(({ lat, lon }) => lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180, {
        error: 'Fuera de rango: lat entre -90 y 90, lon entre -180 y 180',
      }),
  );

export const esquemaRecorrido = z.object({
  origen: punto,
  destino: punto,
  // int32 porque perfil_movilidad.id es int: un número más grande haría fallar la consulta con un 500.
  perfilId: z
    .string({ error: (problema) => (problema.input === undefined ? 'Es obligatorio' : 'No es un id válido') })
    .regex(/^\d+$/, { error: 'No es un id válido' })
    .transform(Number)
    .pipe(z.int32({ error: 'No es un id válido' }).positive({ error: 'No es un id válido' })),
});

export type ConsultaRecorrido = z.output<typeof esquemaRecorrido>;
export type Punto = ConsultaRecorrido['origen'];
