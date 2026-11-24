import { z } from 'zod';
import { clave, email, nombre } from '../auth/esquemas.js';

// int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
const id = (siFalta: string) =>
  z
    .int32({ error: (problema) => (problema.input === undefined ? siFalta : 'No es un id válido') })
    .positive({ error: 'No es un id válido' });

// Los vecinos se registran solos: desde la administración se crean operadores y administradores. El operador
// puede no tener área: entonces ve todo su organismo.
export const esquemaAltaUsuario = z.discriminatedUnion(
  'rol',
  [
    z.object({
      email,
      clave,
      nombre,
      rol: z.literal('OPERADOR'),
      organismoId: id('Es obligatorio'),
      areaId: id('Es obligatoria').nullish(),
    }),
    z.object({
      email,
      clave,
      nombre,
      rol: z.literal('ADMINISTRADOR'),
      organismoId: id('Es obligatorio').nullish(),
      areaId: z.null({ error: 'Solo los operadores tienen área' }).optional(),
    }),
  ],
  {
    error: (problema) =>
      problema.code === 'invalid_union' ? 'Tiene que ser OPERADOR o ADMINISTRADOR' : undefined,
  },
);

export type DatosAltaUsuario = z.output<typeof esquemaAltaUsuario>;

export const esquemaIdUsuario = z.object({
  id: z.coerce
    .number({ error: 'No es válido' })
    .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' })),
});

// Modificar un usuario: su nombre, su rol y dónde trabaja. El correo y la clave son de cada uno.
export const esquemaModificacionUsuario = z.discriminatedUnion(
  'rol',
  [
    z.object({
      nombre,
      rol: z.literal('VECINO'),
      organismoId: z.null({ error: 'Los vecinos no tienen organismo' }).optional(),
      areaId: z.null({ error: 'Solo los operadores tienen área' }).optional(),
    }),
    z.object({
      nombre,
      rol: z.literal('OPERADOR'),
      organismoId: id('Es obligatorio'),
      areaId: id('Es obligatoria').nullish(),
    }),
    z.object({
      nombre,
      rol: z.literal('ADMINISTRADOR'),
      organismoId: id('Es obligatorio').nullish(),
      areaId: z.null({ error: 'Solo los operadores tienen área' }).optional(),
    }),
  ],
  {
    error: (problema) =>
      problema.code === 'invalid_union' ? 'Tiene que ser VECINO, OPERADOR o ADMINISTRADOR' : undefined,
  },
);

export type DatosModificacionUsuario = z.output<typeof esquemaModificacionUsuario>;

// Organismos y áreas (#165). La descripción es optativa: vacía queda en null.
const textoNombre = (maximo: number) =>
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

export const esquemaId = esquemaIdUsuario;

export const esquemaListaOrganismos = z.object({
  todos: z.stringbool({ error: 'Tiene que ser true o false' }).optional(),
});

export const esquemaAltaOrganismo = z.object({ nombre: textoNombre(150), descripcion });

// Si no viene `activo`, queda como está. Con true se reactiva; con false, es la misma baja que DELETE.
export const esquemaModificacionOrganismo = esquemaAltaOrganismo.extend({ activo });

export const esquemaAltaArea = z.object({
  organismoId: id('Es obligatorio'),
  nombre: textoNombre(120),
  descripcion,
});

// El organismo de un área no cambia: sus incidentes y operadores son de ese organismo.
export const esquemaModificacionArea = z.object({ nombre: textoNombre(120), descripcion, activa: activo });
