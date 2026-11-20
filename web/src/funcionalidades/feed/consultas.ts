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

/**
 * Sobre qué se comenta: la foto de un vecino (un reporte, en su publicación) o el problema en general (el
 * incidente, en su ficha).
 */
export interface Comentable {
  tipo: 'reporte' | 'incidente';
  id: number;
}

const RUTA_SOCIAL: Record<Comentable['tipo'], string> = {
  reporte: 'social/reportes',
  incidente: 'social/incidentes',
};

/** Los comentarios de un reporte o de un incidente, del más viejo al más nuevo. */
export function useComentarios(sobre: Comentable) {
  const { pedir, quien } = usePedir();
  return useQuery({
    queryKey: [sobre.tipo, sobre.id, 'comentarios', quien],
    queryFn: async () =>
      (await pedir<{ comentarios: Comentario[] }>(`${RUTA_SOCIAL[sobre.tipo]}/${sobre.id}/comentarios`))
        .comentarios,
  });
}

/** Las acciones van con sesión. Si fallan, no cambia nada en pantalla: quien las usa muestra el error. */
function usePedirConSesion() {
  const cliente = useCliente();
  return async <T>(ruta: string, opciones: OpcionesPeticion) => {
    try {
      return await cliente.pedir<T>(ruta, opciones);
    } catch (error) {
      throw aErrorApi(error);
    }
  };
}

/**
 * Al salir bien una acción se vuelve a pedir lo que la muestra: el feed, la publicación o la ficha y sus
 * comentarios, y las listas del incidente (sus contadores, y quién es cada «Vecino N»).
 */
function useRefrescar(sobre: Comentable) {
  const consulta = useQueryClient();
  return async () => {
    await Promise.all([
      consulta.invalidateQueries({ queryKey: ['feed'] }),
      consulta.invalidateQueries({ queryKey: [sobre.tipo, sobre.id] }),
      consulta.invalidateQueries({ queryKey: ['incidente'] }),
    ]);
  };
}

/** Dar o quitar el me gusta de un reporte (#151): solo las fotos tienen me gusta. */
export function useMeGusta(reporteId: number) {
  const pedir = usePedirConSesion();
  const refrescar = useRefrescar({ tipo: 'reporte', id: reporteId });
  return useMutation({
    mutationFn: (dar: boolean) =>
      pedir(`social/reportes/${reporteId}/me-gusta`, { metodo: dar ? 'POST' : 'DELETE' }),
    onSuccess: refrescar,
  });
}

/** Comentar un reporte o un incidente, y editar o eliminar sus comentarios (#151). */
export function useAccionesSociales(sobre: Comentable) {
  const pedir = usePedirConSesion();
  const refrescar = useRefrescar(sobre);

  return {
    comentar: useMutation({
      mutationFn: (texto: string) =>
        pedir<Comentario>(`${RUTA_SOCIAL[sobre.tipo]}/${sobre.id}/comentarios`, {
          metodo: 'POST',
          cuerpo: { texto },
        }),
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
