import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioGestion } from '../../compartido/red/repositorioGestion.js';
import type { FichaGestion, FiltrosBandeja, Movimiento, Referencia } from './tipos.js';

function useRepositorio() {
  const cliente = useCliente();
  return useMemo(() => crearRepositorioGestion(cliente), [cliente]);
}

/** La bandeja con los filtros de la URL. Mientras llega la nueva, queda a la vista la anterior. */
export function useBandeja(filtros: FiltrosBandeja) {
  const repositorio = useRepositorio();
  return useQuery({
    queryKey: ['bandeja', filtros],
    queryFn: () => repositorio.bandeja(filtros).catch((error: unknown) => Promise.reject(aErrorApi(error))),
    placeholderData: keepPreviousData,
  });
}

/**
 * Las áreas del organismo, sacadas de las categorías: no hay una ruta que las liste para el operador. Un área
 * sin categorías activas no aparece (decisión del 27/10).
 */
export function useAreas() {
  const categorias = useCategorias();
  const areas = useMemo(() => {
    const porId = new Map<number, Referencia>();
    for (const { area } of categorias.data ?? []) porId.set(area.id, area);
    return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [categorias.data]);
  return { areas, categorias };
}

export function useFicha(id: number) {
  const repositorio = useRepositorio();
  return useQuery({
    queryKey: ['gestion', id],
    queryFn: () => repositorio.ficha(id).catch((error: unknown) => Promise.reject(aErrorApi(error))),
  });
}

/**
 * Las acciones del operador sobre un incidente. Cuando una sale bien, su movimiento se agrega a la bitácora en
 * pantalla en el momento, y la ficha se vuelve a pedir para traer lo que el servidor recalculó (la prioridad).
 */
export function useAccionesFicha(id: number) {
  const repositorio = useRepositorio();
  const consulta = useQueryClient();

  const refrescar = () => {
    void consulta.invalidateQueries({ queryKey: ['gestion', id] });
    void consulta.invalidateQueries({ queryKey: ['bandeja'] });
    // El mapa y la pestaña «Incidentes» muestran el estado y la categoría.
    void consulta.invalidateQueries({ queryKey: ['incidentes'] });
    void consulta.invalidateQueries({ queryKey: ['reportesDelOrganismo'] });
  };
  const aplicar = (cambios: Partial<FichaGestion>, movimiento?: Movimiento) => {
    consulta.setQueryData<FichaGestion>(['gestion', id], (ficha) =>
      ficha
        ? { ...ficha, ...cambios, bitacora: movimiento ? [...ficha.bitacora, movimiento] : ficha.bitacora }
        : ficha,
    );
    refrescar();
  };
  // 409: otro operador lo cambió mientras tanto. Se trae la ficha de nuevo para ofrecer lo que corresponde.
  const alFallar = (error: unknown) => {
    if (aErrorApi(error).status === 409) refrescar();
  };

  const derivar = useMutation({
    mutationFn: ({ areaId, comentario }: { areaId: number; comentario: string }) =>
      repositorio.derivar(id, areaId, comentario),
    onSuccess: ({ estado, area, movimiento }) => aplicar({ estado, area }, movimiento),
    onError: alFallar,
  });
  const cambiarEstado = useMutation({
    mutationFn: ({ estado, comentario }: { estado: 'EN_EJECUCION' | 'DESESTIMADO'; comentario: string }) =>
      repositorio.cambiarEstado(id, estado, comentario),
    onSuccess: ({ estado, movimiento }) => aplicar({ estado }, movimiento),
    onError: alFallar,
  });
  const comentar = useMutation({
    mutationFn: (comentario: string) => repositorio.comentar(id, comentario),
    onSuccess: ({ movimiento }) => aplicar({}, movimiento),
    onError: alFallar,
  });
  const cambiarCategoria = useMutation({
    mutationFn: ({ categoriaId, comentario }: { categoriaId: number; comentario: string }) =>
      repositorio.cambiarCategoria(id, categoriaId, comentario),
    onSuccess: ({ categoria, area, movimiento }) => aplicar({ categoria, area }, movimiento),
    onError: alFallar,
  });
  const fijarPrioridad = useMutation({
    mutationFn: ({ valor, motivo }: { valor: number; motivo: string }) =>
      repositorio.fijarPrioridad(id, valor, motivo),
    onSuccess: (prioridad) => aplicar({ prioridad }),
    onError: alFallar,
  });
  const quitarPrioridad = useMutation({
    mutationFn: () => repositorio.quitarPrioridad(id),
    onSuccess: (prioridad) => aplicar({ prioridad }),
    onError: alFallar,
  });

  return { derivar, cambiarEstado, comentar, cambiarCategoria, fijarPrioridad, quitarPrioridad };
}
