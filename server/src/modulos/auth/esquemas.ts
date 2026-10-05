import { z } from 'zod';

export const email = z
  .string({ error: 'Es obligatorio' })
  .trim()
  .toLowerCase()
  .pipe(
    z.email({ error: 'No es un correo válido' }).max(150, { error: 'Tiene que tener hasta 150 caracteres' }),
  );

// bcrypt solo usa los primeros 72 bytes de la clave: más largo no suma seguridad y confunde.
// Se cuentan bytes y no caracteres porque una ñ o una vocal con tilde ocupan dos.
export const clave = z
  .string({ error: 'Es obligatoria' })
  .min(8, { error: 'Tiene que tener al menos 8 caracteres' })
  .refine((valor) => Buffer.byteLength(valor) <= 72, {
    error: 'Tiene que tener hasta 72 caracteres (menos si usa tildes o ñ)',
  });

export const nombre = z
  .string({ error: 'Es obligatorio' })
  .trim()
  .min(1, { error: 'Es obligatorio' })
  .max(120, { error: 'Tiene que tener hasta 120 caracteres' });

export const esquemaRegistro = z.object({ email, clave, nombre });

// En el ingreso no se validan largos: una clave mal escrita tiene que dar 401, no 400.
export const esquemaIngreso = z.object({
  email: z.string({ error: 'Es obligatorio' }).trim().toLowerCase(),
  clave: z.string({ error: 'Es obligatoria' }),
});

export const esquemaTokenRenovacion = z.object({
  tokenRenovacion: z.string({ error: 'Es obligatorio' }).min(1, { error: 'Es obligatorio' }),
});

// El token que llega en el link de un correo.
const tokenEnlace = z.string({ error: 'Es obligatorio' }).min(1, { error: 'Es obligatorio' });

export const esquemaConfirmarCorreo = z.object({ token: tokenEnlace });

export const esquemaRecuperarClave = z.object({ email });

export const esquemaRestablecerClave = z.object({ token: tokenEnlace, clave });
