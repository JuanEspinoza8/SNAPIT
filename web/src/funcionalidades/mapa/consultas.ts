import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import type { Categoria, FichaIncidente, FiltrosMapa, PuntoMapa, Rectangulo } from './tipos.js';

/** Arma la consulta de GET /api/incidentes. El bbox se redondea para no pedir de nuevo por un píxel. */
export function rutaIncidentes(filtros: FiltrosMapa, vista: Rectangulo | null) {
  const parametros = new URLSearchParams();
  if (vista) {
    // El servidor exige longitudes entre -180 y 180 y latitudes entre -90 y 90: muy alejado, el mapa se pasa.
    const recortar = (valor: number, limite: number) => Math.max(-limite, Math.min(limite, valor)).toFixed(4);
    parametros.set(
      'bbox',
      [
        recortar(vista.oeste, 180),
        recortar(vista.sur, 90),
        recortar(vista.este, 180),
        recortar(vista.norte, 90),
      ].join(','),
    );
  }
  if (filtros.categoriaId) parametros.set('categoriaId', String(filtros.categoriaId));
  if (filtros.estado) parametros.set('estado', filtros.estado);
  if (filtros.desde) parametros.set('desde', filtros.desde);
  if (filtros.hasta) parametros.set('hasta', filtros.hasta);
  const consulta = parametros.toString();
  return consulta ? `incidentes?${consulta}` : 'incidentes';
}

export function useIncidentes(filtros: FiltrosMapa, vista: Rectangulo | null) {
  const cliente = useCliente();
  const ruta = rutaIncidentes(filtros, vista);
  return useQuery({
    queryKey: ['incidentes', ruta],
    queryFn: async () => {
      try {
        return (await cliente.pedir<{ incidentes: PuntoMapa[] }>(ruta, { sinSesion: true })).incidentes;
      } catch (error) {
        throw aErrorApi(error);
      }
    },
    // Hasta que lleguen los puntos nuevos se siguen viendo los anteriores: el mapa no parpadea.
    placeholderData: keepPreviousData,
    // Sin la vista todavía no se sabe qué pedir.
    enabled: vista !== null,
  });
}

export function useFicha(id: number | null) {
  const cliente = useCliente();
  return useQuery({
    queryKey: ['incidente', id],
    queryFn: async () => {
      try {
        return await cliente.pedir<FichaIncidente>(`incidentes/${id}`, { sinSesion: true });
      } catch (error) {
        throw aErrorApi(error);
      }
    },
    enabled: id !== null,
  });
}

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
