import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAlmacen, useCliente } from '../../compartido/red/clienteContexto.js';
import { crearRepositorioAuth } from '../../compartido/red/repositorioAuth.js';
import { inicioSegunRol } from '../../compartido/sesion/usuario.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';

export interface DatosIngreso {
  email: string;
  clave: string;
}

export function useIngreso() {
  const cliente = useCliente();
  const almacen = useAlmacen();
  const navegar = useNavigate();
  const { guardarSesion } = useSesion();
  const repositorio = useMemo(() => crearRepositorioAuth(cliente), [cliente]);

  return useMutation({
    mutationFn: ({ email, clave }: DatosIngreso) => repositorio.ingreso(email, clave),
    onSuccess: (ingreso) => {
      // Queda guardada en localStorage: al recargar o volver a abrir el
      // navegador la sesión sigue (docs/api.md).
      almacen.guardar({
        tokenAcceso: ingreso.tokenAcceso,
        tokenRenovacion: ingreso.tokenRenovacion,
      });
      guardarSesion(ingreso.usuario);
      navegar(inicioSegunRol(ingreso.usuario), { replace: true });
    },
  });
}
