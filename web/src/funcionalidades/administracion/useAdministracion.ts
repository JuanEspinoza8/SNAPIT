import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAdmin } from '../../compartido/red/repositorioAdmin.js';
import type { DatosAltaUsuario, DatosModificacionUsuario } from './tipos.js';

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
      void consulta.invalidateQueries({ queryKey: ['admin', 'usuarios'] });
    },
  });

  const refrescarUsuarios = () => void consulta.invalidateQueries({ queryKey: ['admin', 'usuarios'] });

  const modificarUsuario = useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosModificacionUsuario }) =>
      repositorio.modificarUsuario(id, datos),
    onSuccess: refrescarUsuarios,
  });

  const darDeBaja = useMutation({
    mutationFn: (id: number) => repositorio.darDeBaja(id),
    onSuccess: refrescarUsuarios,
  });

  return { organismos, usuarios, crearUsuario, modificarUsuario, darDeBaja };
}
