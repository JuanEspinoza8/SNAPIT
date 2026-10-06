import { useQuery } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';

export interface EstadoServidor {
  estado: string;
  baseDeDatos: string;
}

export function useSalud() {
  const cliente = useCliente();

  return useQuery({
    queryKey: ['salud'],
    queryFn: async (): Promise<EstadoServidor> => {
      try {
        return await cliente.pedir<EstadoServidor>('salud');
      } catch (error) {
        // La pantalla muestra el mensaje de errorApi, no el error crudo de fetch.
        throw aErrorApi(error);
      }
    },
  });
}
