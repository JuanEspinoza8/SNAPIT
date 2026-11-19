import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Eliminar un reporte propio. Al salir bien, se vuelven a pedir la lista y el feed. */
export function useEliminarReporte() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const repositorio = useMemo(() => crearRepositorioReportes(cliente), [cliente]);
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await repositorio.eliminar(id);
      } catch (error) {
        throw aErrorApi(error);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        consulta.invalidateQueries({ queryKey: ['misReportes'] }),
        consulta.invalidateQueries({ queryKey: ['feed'] }),
        consulta.invalidateQueries({ queryKey: ['incidente'] }),
      ]);
    },
  });
}
