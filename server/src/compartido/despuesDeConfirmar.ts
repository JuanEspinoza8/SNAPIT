import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../config/logger.js';

/*
 * Tareas que tienen que correr recién cuando se confirma la transacción en la que se pidieron: por ejemplo, un
 * aviso al celular (avisos/disparar.ts). Si corrieran adentro, saldría un aviso de algo que después se deshizo,
 * y la transacción quedaría esperando a Firebase con los incidentes bloqueados.
 *
 * transaccion() (reportes/repositorio.ts) abre el contexto: lo que se pide adentro con despuesDeConfirmar() se
 * guarda, y se lanza cuando la transacción termina bien. Si falla, se descarta.
 */

type Tarea = () => Promise<unknown>;

const pendientes = new AsyncLocalStorage<Tarea[]>();
const enCurso = new Set<Promise<unknown>>();

/** Corre `fn` juntando las tareas que pida, y las lanza solo si `fn` termina bien. */
export async function conTareasAlConfirmar<T>(fn: () => Promise<T>): Promise<T> {
  const tareas: Tarea[] = [];
  const resultado = await pendientes.run(tareas, fn);
  for (const tarea of tareas) lanzar(tarea);
  return resultado;
}

/**
 * Pide correr `tarea` cuando se confirme la transacción en curso. Fuera de una transacción, corre enseguida. No
 * se espera: quien hizo el cambio no tiene por qué demorarse por un aviso, y si falla queda en el log.
 */
export function despuesDeConfirmar(tarea: Tarea) {
  const tareas = pendientes.getStore();
  if (tareas) tareas.push(tarea);
  else lanzar(tarea);
}

function lanzar(tarea: Tarea) {
  const promesa: Promise<unknown> = tarea()
    .catch((error: unknown) => logger.error({ err: error }, 'Falló una tarea posterior a la transacción'))
    .finally(() => enCurso.delete(promesa));
  enCurso.add(promesa);
}

/** Para los tests: espera a que terminen las tareas lanzadas, incluidas las que estas lancen a su vez. */
export async function esperarTareasPendientes() {
  while (enCurso.size > 0) await Promise.all([...enCurso]);
}
