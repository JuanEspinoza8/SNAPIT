import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAdmin } from '../../compartido/red/repositorioAdmin.js';
import type { DatosArea, DatosOrganismo } from './tipos.js';

/**
 * La administración de organismos y áreas (#168). Cada cambio vuelve a pedir las dos listas de organismos: la de
 * acá y la de los activos, que usa la pantalla de usuarios para elegir dónde trabaja cada uno.
 */
export function useOrganismos() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const repositorio = useMemo(() => crearRepositorioAdmin(cliente), [cliente]);
  const refrescar = () => consulta.invalidateQueries({ queryKey: ['admin', 'organismos'] });

  const organismos = useQuery({
    queryKey: ['admin', 'organismos', 'todos'],
    queryFn: () => repositorio.listarOrganismosAdmin(),
  });

  const guardarOrganismo = useMutation({
    mutationFn: ({ id, datos }: { id: number | null; datos: DatosOrganismo }) =>
      id === null ? repositorio.crearOrganismo(datos) : repositorio.modificarOrganismo(id, datos),
    onSuccess: refrescar,
  });

  const darDeBajaOrganismo = useMutation({
    mutationFn: (id: number) => repositorio.darDeBajaOrganismo(id),
    onSuccess: refrescar,
  });

  const guardarArea = useMutation({
    mutationFn: ({ id, organismoId, datos }: { id: number | null; organismoId: number; datos: DatosArea }) =>
      id === null ? repositorio.crearArea({ ...datos, organismoId }) : repositorio.modificarArea(id, datos),
    onSuccess: refrescar,
  });

  const darDeBajaArea = useMutation({
    mutationFn: (id: number) => repositorio.darDeBajaArea(id),
    onSuccess: refrescar,
  });

  return { organismos, guardarOrganismo, darDeBajaOrganismo, guardarArea, darDeBajaArea };
}

export type Organismos = ReturnType<typeof useOrganismos>;
