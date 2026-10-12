import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioReportes } from '../../compartido/red/repositorioReportes.js';
import type { DatosReporte } from './tipos.js';

export function useReportar() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const repositorio = useMemo(() => crearRepositorioReportes(cliente), [cliente]);

  return useMutation({
    mutationFn: (datos: DatosReporte) => repositorio.enviar(datos),
    onSuccess: () => {
      void consulta.invalidateQueries({ queryKey: ['incidentes'] });
    },
  });
}
