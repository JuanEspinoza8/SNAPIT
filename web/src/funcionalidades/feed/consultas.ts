import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import type { Comentario, PaginaFeed, ReportePublico } from './tipos.js';

/** De a cuántos incidentes pide el feed: alcanza para llenar la pantalla y un poco más. */
export const POR_PAGINA = 10;

// Todas son públicas: van sin sesión, como el mapa, para que un token vencido no dispare una renovación.
function usePedir() {
  const cliente = useCliente();
  return async <T>(ruta: string) => {
    try {
      return await cliente.pedir<T>(ruta, { sinSesion: true });
    } catch (error) {
      throw aErrorApi(error);
    }
  };
}

/** El feed, de a páginas: cada una arranca donde terminó la anterior (paginación por cursor). */
export function useFeed() {
  const pedir = usePedir();
  return useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const parametros = new URLSearchParams({ limite: String(POR_PAGINA) });
      if (pageParam) parametros.set('cursor', pageParam);
      return pedir<PaginaFeed>(`incidentes/feed?${parametros}`);
    },
    getNextPageParam: (ultima) => ultima.siguiente,
  });
}

export function useReportesDeIncidente(id: number) {
  const pedir = usePedir();
  return useQuery({
    queryKey: ['incidente', id, 'reportes'],
    queryFn: async () => (await pedir<{ reportes: ReportePublico[] }>(`incidentes/${id}/reportes`)).reportes,
  });
}

export function useComentariosDeIncidente(id: number) {
  const pedir = usePedir();
  return useQuery({
    queryKey: ['incidente', id, 'comentarios'],
    queryFn: async () =>
      (await pedir<{ comentarios: Comentario[] }>(`incidentes/${id}/comentarios`)).comentarios,
  });
}

export function useReporte(id: number) {
  const pedir = usePedir();
  return useQuery({
    queryKey: ['reporte', id],
    queryFn: () => pedir<ReportePublico>(`reportes/${id}/publico`),
  });
}

export function useComentariosDeReporte(id: number) {
  const pedir = usePedir();
  return useQuery({
    queryKey: ['reporte', id, 'comentarios'],
    queryFn: async () =>
      (await pedir<{ comentarios: Comentario[] }>(`reportes/${id}/comentarios`)).comentarios,
  });
}
