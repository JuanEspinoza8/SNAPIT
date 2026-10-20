import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioReportes } from '../../compartido/red/repositorioReportes.js';
import type { DecisionRevision } from './tipos.js';

export function useRevision() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const repositorio = useMemo(() => crearRepositorioReportes(cliente), [cliente]);

  const pendientes = useQuery({
    queryKey: ['reportesPendientes'],
    queryFn: async () => {
      try {
        return await repositorio.pendientes();
      } catch (error) {
        // Todo error sale como ErrorApi: así la pantalla lo muestra igual siempre.
        throw aErrorApi(error);
      }
    },
  });

  const revisar = useMutation({
    mutationFn: ({
      id,
      decision,
      comentario,
    }: {
      id: number;
      decision: DecisionRevision;
      comentario: string;
    }) => repositorio.revisar(id, decision, comentario),
    onSuccess: () => {
      // El reporte quedó decidido: sale de la lista al volver a pedirla.
      void consulta.invalidateQueries({ queryKey: ['reportesPendientes'] });
    },
    onError: (error) => {
      // 409: otro operador lo revisó primero. La lista se refresca y el reporte desaparece.
      if (aErrorApi(error).codigo === 'REPORTE_YA_REVISADO') {
        void consulta.invalidateQueries({ queryKey: ['reportesPendientes'] });
      }
    },
  });

  return { pendientes, revisar };
}
