import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAuth } from '../../compartido/red/repositorioAuth.js';

export interface DatosRecuperarClave {
  email: string;
}

export function useRecuperarClave() {
  const cliente = useCliente();
  const repositorio = useMemo(() => crearRepositorioAuth(cliente), [cliente]);

  return useMutation({
    mutationFn: ({ email }: DatosRecuperarClave) => repositorio.recuperarClave(email),
  });
}
