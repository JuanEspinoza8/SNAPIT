import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioReportes } from '../../compartido/red/repositorioReportes.js';

export function useMisReportes() {
  const cliente = useCliente();
  const repositorio = useMemo(() => crearRepositorioReportes(cliente), [cliente]);

  return useQuery({
    queryKey: ['misReportes'],
    queryFn: async () => {
      try {
        return await repositorio.mios();
      } catch (error) {
        // Todo error sale como ErrorApi: así la pantalla lo muestra igual siempre.
        throw aErrorApi(error);
      }
    },
  });
}
