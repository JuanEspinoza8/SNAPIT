import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi, type ErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioIndicadores } from '../../compartido/red/repositorioIndicadores.js';
import type { FiltrosIndicadores, Indicadores, PuntoCalor } from './tipos.js';

function useRepositorio() {
  const cliente = useCliente();
  return useMemo(() => crearRepositorioIndicadores(cliente), [cliente]);
}

const conErrorApi = <T>(promesa: Promise<T>) =>
  promesa.catch((error: unknown) => Promise.reject(aErrorApi(error)));

// Al cambiar un filtro se siguen viendo los gráficos anteriores hasta que llegan los nuevos: no parpadean.
export function useIndicadores(filtros: FiltrosIndicadores | null) {
  const repositorio = useRepositorio();
  return useQuery<Indicadores, ErrorApi>({
    queryKey: ['indicadores', filtros],
    queryFn: () => conErrorApi(repositorio.indicadores(filtros!)),
    enabled: filtros !== null,
    placeholderData: keepPreviousData,
  });
}

export function useCalor(filtros: FiltrosIndicadores | null) {
  const repositorio = useRepositorio();
  return useQuery<PuntoCalor[], ErrorApi>({
    queryKey: ['indicadores', 'calor', filtros],
    queryFn: () => conErrorApi(repositorio.calor(filtros!)),
    enabled: filtros !== null,
    placeholderData: keepPreviousData,
  });
}
