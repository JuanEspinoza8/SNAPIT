import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi, type ErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioInformes } from '../../compartido/red/repositorioInformes.js';
import { nombreDelPdf } from './formato.js';
import type { Informe, PedidoInforme, ResumenInforme } from './tipos.js';

function useRepositorio() {
  const cliente = useCliente();
  return useMemo(() => crearRepositorioInformes(cliente), [cliente]);
}

const conErrorApi = <T>(promesa: Promise<T>) =>
  promesa.catch((error: unknown) => Promise.reject(aErrorApi(error)));

export function useHistorial() {
  const repositorio = useRepositorio();
  return useQuery<ResumenInforme[], ErrorApi>({
    queryKey: ['informes'],
    queryFn: () => conErrorApi(repositorio.historial()),
  });
}

export function useInforme(id: number | null) {
  const repositorio = useRepositorio();
  return useQuery<Informe, ErrorApi>({
    queryKey: ['informes', id],
    queryFn: () => conErrorApi(repositorio.informe(id!)),
    enabled: id !== null,
    // Un informe guardado no cambia.
    staleTime: Infinity,
  });
}

export function useBarrios() {
  const repositorio = useRepositorio();
  return useQuery<string[], ErrorApi>({
    queryKey: ['barrios'],
    queryFn: () => conErrorApi(repositorio.barrios()),
  });
}

/** Generar un informe. Al terminar, queda en la caché (no se vuelve a pedir) y el historial se actualiza. */
export function useGenerarInforme(alGenerar: (informe: Informe) => void) {
  const repositorio = useRepositorio();
  const consulta = useQueryClient();
  return useMutation<Informe, ErrorApi, PedidoInforme>({
    mutationFn: (pedido) => conErrorApi(repositorio.generar(pedido)),
    onSuccess: (informe) => {
      consulta.setQueryData(['informes', informe.id], informe);
      void consulta.invalidateQueries({ queryKey: ['informes'], exact: true });
      alGenerar(informe);
    },
  });
}

/**
 * Bajar el PDF. Se pide con el cliente (lleva la sesión, que un enlace común no manda) y se guarda con un
 * enlace temporal al archivo.
 */
export function useDescargarPdf() {
  const repositorio = useRepositorio();
  const descarga = useMutation<void, ErrorApi, Pick<Informe, 'id' | 'desde' | 'hasta'>>({
    mutationFn: async (informe) => {
      const archivo = await conErrorApi(repositorio.pdf(informe.id));
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreDelPdf(informe);
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      // Después de que el navegador empezó a guardarlo.
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
  });
  return { descargar: descarga.mutate, descargando: descarga.isPending, error: descarga.error };
}
