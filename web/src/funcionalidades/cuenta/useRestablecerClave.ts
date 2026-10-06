import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAuth } from '../../compartido/red/repositorioAuth.js';

export interface DatosRestablecerClave {
  token: string;
  clave: string;
}

export function useRestablecerClave() {
  const cliente = useCliente();
  const repositorio = useMemo(() => crearRepositorioAuth(cliente), [cliente]);

  return useMutation({
    mutationFn: ({ token, clave }: DatosRestablecerClave) => repositorio.restablecerClave(token, clave),
  });
}
