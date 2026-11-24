import type {
  CategoriaAdmin,
  CeldaMatriz,
  DatosCategoria,
  DatosPerfil,
  Parametro,
  PerfilAdmin,
} from '../../funcionalidades/administracion/catalogo/tipos.js';
import type { ClienteApi } from './cliente.js';

export type CambioCelda = Pick<CeldaMatriz, 'perfilMovilidadId' | 'intransitable' | 'factorPenalizacion'>;

/** Categorías, perfiles, la matriz y los parámetros (#166, #167). Todo es solo para administradores. */
export function crearRepositorioCatalogoAdmin(cliente: ClienteApi) {
  return {
    listarCategorias(): Promise<{ categorias: CategoriaAdmin[] }> {
      return cliente.pedir('/admin/categorias');
    },
    crearCategoria(datos: DatosCategoria): Promise<{ categoria: CategoriaAdmin }> {
      return cliente.pedir('/admin/categorias', { metodo: 'POST', cuerpo: datos });
    },
    modificarCategoria(
      id: number,
      datos: DatosCategoria,
    ): Promise<{ categoria: CategoriaAdmin; prioridadesRecalculadas: number }> {
      return cliente.pedir(`/admin/categorias/${id}`, { metodo: 'PUT', cuerpo: datos });
    },
    async darDeBajaCategoria(id: number) {
      await cliente.pedir(`/admin/categorias/${id}`, { metodo: 'DELETE' });
    },
    guardarMatriz(id: number, perfiles: CambioCelda[]): Promise<{ perfiles: CeldaMatriz[] }> {
      return cliente.pedir(`/admin/categorias/${id}/perfiles`, { metodo: 'PUT', cuerpo: { perfiles } });
    },
    listarPerfiles(): Promise<{ perfiles: PerfilAdmin[] }> {
      return cliente.pedir('/admin/perfiles-movilidad');
    },
    crearPerfil(datos: DatosPerfil): Promise<{ perfil: PerfilAdmin }> {
      return cliente.pedir('/admin/perfiles-movilidad', { metodo: 'POST', cuerpo: datos });
    },
    modificarPerfil(id: number, datos: DatosPerfil): Promise<{ perfil: PerfilAdmin }> {
      return cliente.pedir(`/admin/perfiles-movilidad/${id}`, { metodo: 'PUT', cuerpo: datos });
    },
    async darDeBajaPerfil(id: number) {
      await cliente.pedir(`/admin/perfiles-movilidad/${id}`, { metodo: 'DELETE' });
    },
    listarParametros(): Promise<{ parametros: Parametro[] }> {
      return cliente.pedir('/admin/parametros');
    },
    guardarParametros(parametros: { clave: string; valor: string }[]): Promise<{ parametros: Parametro[] }> {
      return cliente.pedir('/admin/parametros', { metodo: 'PUT', cuerpo: { parametros } });
    },
  };
}
