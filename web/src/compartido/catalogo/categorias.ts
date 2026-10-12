import { useQuery } from '@tanstack/react-query';
import { useCliente } from '../red/clienteContexto.js';
import { aErrorApi } from '../red/error.js';

/** Una categoría de GET /api/categorias. La web solo usa el id y el nombre. */
export interface Categoria {
  id: number;
  nombre: string;
}

/** Las categorías activas: las usan los filtros del mapa y el formulario de reporte. */
export function useCategorias() {
  const cliente = useCliente();
  return useQuery({
    queryKey: ['categorias'],
    queryFn: async () => {
      try {
        return (await cliente.pedir<{ categorias: Categoria[] }>('categorias', { sinSesion: true }))
          .categorias;
      } catch (error) {
        throw aErrorApi(error);
      }
    },
    // Las categorías casi no cambian.
    staleTime: 10 * 60 * 1000,
  });
}
