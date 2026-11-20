import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import { listarBarriosConIncidentes, listarCategoriasActivas } from '../catalogo/repositorio.js';
import { interpretarConsulta } from '../ia/interpretarConsulta.js';
import { IaNoDisponible } from '../ia/servicio.js';
import { describir, hoyEnArgentina, validarPropuesta } from './calculo.js';
import { esquemaConsulta } from './esquemas.js';

// En los dos casos la app ofrece los filtros comunes (F15).
const NO_ENTENDIDA = 'No entendimos la pregunta. Probá con otras palabras o usá los filtros.';
const SIN_IA = 'No pudimos interpretar la pregunta en este momento. Usá los filtros.';

const noEntendida = (mensaje: string) => new ErrorApp(422, 'CONSULTA_NO_ENTENDIDA', mensaje);

/**
 * Traduce una pregunta en lenguaje natural a los filtros de GET /api/incidentes (F15). La IA solo propone
 * filtros a partir de las listas que se le pasan; la búsqueda la hace después el cliente con esos filtros.
 */
export async function interpretar(usuarioId: number, cuerpo: unknown, ahora = new Date()) {
  const { texto } = validar(esquemaConsulta, cuerpo);
  if (texto === '') throw noEntendida(NO_ENTENDIDA);

  const [categorias, barrios] = await Promise.all([listarCategoriasActivas(), listarBarriosConIncidentes()]);

  let respuesta;
  try {
    respuesta = await interpretarConsulta(usuarioId, texto, {
      hoy: hoyEnArgentina(ahora),
      categorias,
      barrios,
    });
  } catch (error) {
    // El motivo ya quedó en registro_ia y en el log (servicioIa).
    if (error instanceof IaNoDisponible) throw noEntendida(SIN_IA);
    throw error;
  }
  if (!respuesta.propuesta.entendida) throw noEntendida(NO_ENTENDIDA);

  const interpretacion = validarPropuesta(respuesta.propuesta, { categorias, barrios });
  return {
    filtros: interpretacion.filtros,
    descripcion: describir(interpretacion),
    registroIaId: respuesta.registroIaId,
  };
}
