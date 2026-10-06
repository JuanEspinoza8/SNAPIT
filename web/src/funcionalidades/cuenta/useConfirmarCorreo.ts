import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAuth } from '../../compartido/red/repositorioAuth.js';

export function useConfirmarCorreo() {
  const cliente = useCliente();
  const repositorio = useMemo(() => crearRepositorioAuth(cliente), [cliente]);

  return useMutation({
    mutationFn: (token: string) => repositorio.confirmarCorreo(token),
  });
}
