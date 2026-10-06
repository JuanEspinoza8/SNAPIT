import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAuth } from '../../compartido/red/repositorioAuth.js';

export interface DatosRegistro {
  nombre: string;
  email: string;
  clave: string;
}

export function useRegistro() {
  const cliente = useCliente();
  const repositorio = useMemo(() => crearRepositorioAuth(cliente), [cliente]);

  return useMutation({
    mutationFn: ({ nombre, email, clave }: DatosRegistro) => repositorio.registro(nombre, email, clave),
  });
}
