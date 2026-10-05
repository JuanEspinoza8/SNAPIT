import { z } from 'zod';
import { clave, email, nombre } from '../auth/esquemas.js';

// int32 porque las columnas id son int: un número más grande haría fallar la consulta con un 500.
const id = (siFalta: string) =>
  z
    .int32({ error: (problema) => (problema.input === undefined ? siFalta : 'No es un id válido') })
    .positive({ error: 'No es un id válido' });

// Los vecinos se registran solos: desde la administración se crean operadores y administradores.
export const esquemaAltaUsuario = z.discriminatedUnion(
  'rol',
  [
    z.object({
      email,
      clave,
      nombre,
      rol: z.literal('OPERADOR'),
      organismoId: id('Es obligatorio'),
      areaId: id('Es obligatoria'),
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
