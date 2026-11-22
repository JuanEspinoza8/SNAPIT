import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../../compartido/red/clienteContexto.js';
import {
  type CambioCelda,
  crearRepositorioCatalogoAdmin,
} from '../../../compartido/red/repositorioCatalogoAdmin.js';
import type { DatosCategoria, DatosPerfil } from './tipos.js';

const CATEGORIAS = ['admin', 'categorias'];
const PERFILES = ['admin', 'perfiles'];
const PARAMETROS = ['admin', 'parametros'];

function useRepositorio() {
  const cliente = useCliente();
  return useMemo(() => crearRepositorioCatalogoAdmin(cliente), [cliente]);
}

/**
 * Las categorías y su ABM. Un cambio vuelve a pedir también la lista pública de categorías (la del reporte y la
 * bandeja) y la de organismos, que cuenta las categorías activas de cada área.
 */
export function useCategoriasAdmin() {
  const repositorio = useRepositorio();
  const consulta = useQueryClient();
  const refrescar = () => {
    void consulta.invalidateQueries({ queryKey: CATEGORIAS });
    void consulta.invalidateQueries({ queryKey: ['admin', 'organismos'] });
    void consulta.invalidateQueries({ queryKey: ['categorias'] });
  };

  const categorias = useQuery({ queryKey: CATEGORIAS, queryFn: () => repositorio.listarCategorias() });
  const guardar = useMutation({
    mutationFn: ({ id, datos }: { id: number | null; datos: DatosCategoria }) =>
      id === null
        ? repositorio.crearCategoria(datos).then((r) => ({ ...r, prioridadesRecalculadas: 0 }))
        : repositorio.modificarCategoria(id, datos),
    onSuccess: refrescar,
  });
  const darDeBaja = useMutation({
    mutationFn: (id: number) => repositorio.darDeBajaCategoria(id),
    onSuccess: refrescar,
  });
  const guardarMatriz = useMutation({
    mutationFn: async (cambios: Map<number, CambioCelda[]>) => {
      // Una fila por pedido: el servidor guarda la matriz de a una categoría.
      for (const [categoriaId, celdas] of cambios) await repositorio.guardarMatriz(categoriaId, celdas);
    },
    onSettled: () => void consulta.invalidateQueries({ queryKey: CATEGORIAS }),
  });
  return { categorias, guardar, darDeBaja, guardarMatriz };
}

export function usePerfilesAdmin() {
  const repositorio = useRepositorio();
  const consulta = useQueryClient();
  const refrescar = () => {
    void consulta.invalidateQueries({ queryKey: PERFILES });
    // Un perfil nuevo suma una columna a la matriz y sus reglas a los parámetros.
    void consulta.invalidateQueries({ queryKey: CATEGORIAS });
    void consulta.invalidateQueries({ queryKey: PARAMETROS });
  };

  const perfiles = useQuery({ queryKey: PERFILES, queryFn: () => repositorio.listarPerfiles() });
  const guardar = useMutation({
    mutationFn: ({ id, datos }: { id: number | null; datos: DatosPerfil }) =>
      id === null ? repositorio.crearPerfil(datos) : repositorio.modificarPerfil(id, datos),
    onSuccess: refrescar,
  });
  const darDeBaja = useMutation({
    mutationFn: (id: number) => repositorio.darDeBajaPerfil(id),
    onSuccess: refrescar,
  });
  return { perfiles, guardar, darDeBaja };
}

export function useParametrosAdmin() {
  const repositorio = useRepositorio();
  const consulta = useQueryClient();
  const parametros = useQuery({ queryKey: PARAMETROS, queryFn: () => repositorio.listarParametros() });
  const guardar = useMutation({
    mutationFn: (cambios: { clave: string; valor: string }[]) => repositorio.guardarParametros(cambios),
    onSuccess: () => {
      void consulta.invalidateQueries({ queryKey: PARAMETROS });
      void consulta.invalidateQueries({ queryKey: PERFILES });
    },
  });
  return { parametros, guardar };
}
