import { Prisma, type TipoIa } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';

export interface IntentoIa {
  usuarioId: number | null;
  tipo: TipoIa;
  modelo: string;
  entrada: string;
  /** Lo que respondió el modelo: el JSON ya validado, o el texto crudo si no se pudo usar. */
  salida: Prisma.InputJsonValue | null;
  duracionMs: number;
  exito: boolean;
  error: string | null;
}

/** Guarda un intento en registro_ia, haya salido bien o mal. Devuelve su id. */
export async function registrarIntento(intento: IntentoIa) {
  const { id } = await prisma.registroIa.create({
    data: {
      ...intento,
      proveedor: 'ANTHROPIC',
      salida: intento.salida ?? Prisma.DbNull,
    },
    select: { id: true },
  });
  return id;
}
