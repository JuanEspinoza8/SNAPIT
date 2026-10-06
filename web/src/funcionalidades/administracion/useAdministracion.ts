import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAdmin } from '../../compartido/red/repositorioAdmin.js';
import type { DatosAltaUsuario } from './tipos.js';

export function useAdministracion() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const repositorio = useMemo(() => crearRepositorioAdmin(cliente), [cliente]);

  const organismos = useQuery({
    queryKey: ['admin', 'organismos'],
    queryFn: () => repositorio.listarOrganismos(),
  });

  const usuarios = useQuery({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => repositorio.listarUsuarios(),
  });

  const crearUsuario = useMutation({
    mutationFn: (datos: DatosAltaUsuario) => repositorio.crearUsuario(datos),
    onSuccess: () => {
      // Recarga la lista: ya está creado el usuario nuevo en el servidor.
      void consulta.invalidateQueries({ queryKey: ['admin', 'usuarios'] });
    },
  });

  return { organismos, usuarios, crearUsuario };
}
