import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpcionesPeticion } from '../../compartido/red/cliente.js';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';
import type { Comentario, PaginaPublicaciones, ReportePublico } from './tipos.js';

/** De a cuántas publicaciones pide el feed: alcanza para llenar la pantalla y un poco más. */
export const POR_PAGINA = 10;

/**
 * Lo social va bajo /api/social (docs/api.md, sección «Social»). Leer es público: sin sesión se pide sin token,
 * como el mapa, para que uno vencido no dispare una renovación. Con sesión se manda, así cada publicación dice si
 * ya le diste me gusta y cada comentario si es tuyo. Las claves de las consultas llevan quién consulta: al
 * ingresar o salir se piden de nuevo.
 */
function usePedir() {
  const cliente = useCliente();
  const { usuario } = useSesion();
  const pedir = async <T>(ruta: string, opciones: OpcionesPeticion = {}) => {
    try {
      return await cliente.pedir<T>(ruta, { sinSesion: !usuario, ...opciones });
    } catch (error) {
      throw aErrorApi(error);
    }
  };
  return { pedir, quien: usuario?.id ?? null };
}

/** El feed de publicaciones, de a páginas: cada una arranca donde terminó la anterior (paginación por cursor). */
export function useFeed() {
  const { pedir, quien } = usePedir();
  return useInfiniteQuery({
    queryKey: ['feed', quien],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const parametros = new URLSearchParams({ limite: String(POR_PAGINA) });
      if (pageParam) parametros.set('cursor', pageParam);
      return pedir<PaginaPublicaciones>(`social/feed?${parametros}`);
    },
    getNextPageParam: (ultima) => ultima.siguiente,
  });
}

/** Los reportes publicados del mismo problema, para la lista de la ficha del incidente. */
export function useReportesDeIncidente(id: number) {
  const { pedir, quien } = usePedir();
  return useQuery({
    queryKey: ['incidente', id, 'reportes', quien],
    queryFn: async () =>
      (await pedir<{ reportes: ReportePublico[] }>(`social/incidentes/${id}/reportes`)).reportes,
  });
}

export function useReporte(id: number) {
  const { pedir, quien } = usePedir();
  return useQuery({
    queryKey: ['reporte', id, quien],
    queryFn: () => pedir<ReportePublico>(`social/reportes/${id}`),
  });
}

export function useComentariosDeReporte(id: number) {
  const { pedir, quien } = usePedir();
  return useQuery({
    queryKey: ['reporte', id, 'comentarios', quien],
    queryFn: async () =>
      (await pedir<{ comentarios: Comentario[] }>(`social/reportes/${id}/comentarios`)).comentarios,
  });
}

/**
 * Dar me gusta, comentar, editar y eliminar comentarios de un reporte (#151). Cada acción, al salir bien, vuelve
 * a pedir lo que muestra los contadores: el feed, la publicación y la lista del incidente. Si falla, no cambia
 * nada en pantalla: quien la usa muestra el error.
 */
export function useAccionesSociales(reporteId: number) {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const pedir = async <T>(ruta: string, opciones: OpcionesPeticion) => {
    try {
      return await cliente.pedir<T>(ruta, opciones);
    } catch (error) {
      throw aErrorApi(error);
    }
  };
  const refrescar = async () => {
    await Promise.all([
      consulta.invalidateQueries({ queryKey: ['feed'] }),
      consulta.invalidateQueries({ queryKey: ['reporte', reporteId] }),
      consulta.invalidateQueries({ queryKey: ['incidente'] }),
    ]);
  };

  return {
    meGusta: useMutation({
      mutationFn: (dar: boolean) =>
        pedir(`social/reportes/${reporteId}/me-gusta`, { metodo: dar ? 'POST' : 'DELETE' }),
      onSuccess: refrescar,
    }),
    comentar: useMutation({
      mutationFn: (texto: string) =>
        pedir<Comentario>(`social/reportes/${reporteId}/comentarios`, { metodo: 'POST', cuerpo: { texto } }),
      onSuccess: refrescar,
    }),
    editar: useMutation({
      mutationFn: ({ id, texto }: { id: number; texto: string }) =>
        pedir<Comentario>(`social/comentarios/${id}`, { metodo: 'PATCH', cuerpo: { texto } }),
      onSuccess: refrescar,
    }),
    eliminar: useMutation({
      mutationFn: (id: number) => pedir(`social/comentarios/${id}`, { metodo: 'DELETE' }),
      onSuccess: refrescar,
    }),
  };
}
