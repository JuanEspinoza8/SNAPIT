import { z } from 'zod';

// Categorías, perfiles de movilidad y la matriz categoría × perfil (#166).

const id = (siFalta: string) =>
  z
    .int32({ error: (problema) => (problema.input === undefined ? siFalta : 'No es un id válido') })
    .positive({ error: 'No es un id válido' });

export const esquemaId = z.object({
  id: z.coerce
    .number({ error: 'No es válido' })
    .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' })),
});

const nombre = (maximo: number) =>
  z
    .string({ error: 'Es obligatorio' })
    .trim()
    .min(1, { error: 'Es obligatorio' })
    .max(maximo, { error: `Tiene que tener hasta ${maximo} caracteres` });

const descripcion = z
  .string({ error: 'Tiene que ser un texto' })
  .trim()
  .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' })
  .nullish()
  .transform((valor) => (valor ? valor : null));

const activo = z.boolean({ error: 'Tiene que ser true o false' }).optional();

/** Un número con hasta dos decimales, como lo guardan las columnas decimal de la base. */
const conDosDecimales = (minimoExclusivo: number, maximo: number, mensaje: string) =>
  z
    .number({ error: 'Tiene que ser un número' })
    .gt(minimoExclusivo, { error: mensaje })
    .max(maximo, { error: `Tiene que ser hasta ${maximo}` })
    .refine((valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6, {
      error: 'Tiene que tener hasta dos decimales',
    });

const datosCategoria = z.object({
  nombre: nombre(80),
  descripcion,
  areaId: id('Es obligatoria'),
  tipoVigenciaDefault: z.enum(['PERMANENTE', 'TEMPORAL'], { error: 'Tiene que ser PERMANENTE o TEMPORAL' }),
  // Un temporal sin días usa vigencia.dias_default.
  diasCaducidadDefault: z
    .int32({ error: 'Tiene que ser un número entero de días' })
    .positive({ error: 'Tiene que ser mayor que 0' })
    .max(3650, { error: 'Tiene que ser hasta 3650 días' })
    .nullish()
    .transform((dias) => dias ?? null),
  // El peso multiplica la prioridad del incidente (docs/calculos.md): decimal(4,2) en la base.
  pesoSeveridadBase: conDosDecimales(0, 99.99, 'Tiene que ser mayor que 0'),
});

const vigenciaCoherente = <T extends { tipoVigenciaDefault: string; diasCaducidadDefault: number | null }>(
  esquema: z.ZodType<T>,
) =>
  esquema.refine((datos) => datos.tipoVigenciaDefault === 'TEMPORAL' || datos.diasCaducidadDefault === null, {
    path: ['diasCaducidadDefault'],
    error: 'Solo una categoría temporal caduca',
  });

// Una categoría nueva arranca activa. Al modificarla, sin `activa` queda como está; con true se reactiva.
export const esquemaAltaCategoria = vigenciaCoherente(datosCategoria);
export const esquemaCategoria = vigenciaCoherente(datosCategoria.extend({ activa: activo }));

// Las celdas de la matriz de una categoría: las que vengan se reemplazan, las demás quedan como están.
export const esquemaMatriz = z.object({
  perfiles: z
    .array(
      z.object({
        perfilMovilidadId: id('Es obligatorio'),
        intransitable: z.boolean({ error: 'Tiene que ser true o false' }),
        // Cuánto se encarece el tramo si no queda bloqueado: 1 no lo cambia. decimal(5,2) en la base.
        factorPenalizacion: conDosDecimales(0, 999.99, 'Tiene que ser mayor que 0'),
      }),
      { error: 'Tiene que ser una lista' },
    )
    .min(1, { error: 'No hay nada para guardar' }),
});

export const esquemaAltaPerfil = z.object({ nombre: nombre(60), descripcion });
export const esquemaPerfil = esquemaAltaPerfil.extend({ activo });
