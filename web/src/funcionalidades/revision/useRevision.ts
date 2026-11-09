import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioIa } from '../../compartido/red/repositorioIa.js';
import { crearRepositorioReportes } from '../../compartido/red/repositorioReportes.js';
import type { Decision } from './estadoFila.js';
import type { DecisionRevision, ReportePendiente } from './tipos.js';

// Mientras la IA procesa, el log se vuelve a pedir cada tanto. Al terminar, deja de pedirse.
const INTERVALO_MS = 1500;

/**
 * Todo lo de la revisión: los pendientes, la decisión manual y el procesamiento con IA. Vive en la página y no
 * en cada sección: así, al ir a otra sección y volver, lo resuelto sigue a la vista hasta «Limpiar resueltos».
 */
export function useRevision() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const reportes = useMemo(() => crearRepositorioReportes(cliente), [cliente]);
  const ia = useMemo(() => crearRepositorioIa(cliente), [cliente]);
  const [procesoId, setProcesoId] = useState<string | null>(null);

  const pendientes = useQuery({
    queryKey: ['reportesPendientes'],
    queryFn: async () => {
      try {
        return await reportes.pendientes();
      } catch (error) {
        // Todo error sale como ErrorApi: así la pantalla lo muestra igual siempre.
        throw aErrorApi(error);
      }
    },
  });

  // Las filas se acumulan: un reporte que deja de estar pendiente sigue a la vista con su estado final.
  // Se ajustan al llegar una lista nueva, durante el render (el patrón de React para derivar de otro estado).
  const [filas, setFilas] = useState<ReportePendiente[]>([]);
  const [listaVista, setListaVista] = useState<ReportePendiente[] | undefined>(undefined);
  if (pendientes.data !== listaVista) {
    setListaVista(pendientes.data);
    if (pendientes.data) setFilas(sumar(filas, pendientes.data));
  }
  // Lo decidido a mano desde esta pantalla: la fila queda con su resultado hasta «Limpiar resueltos».
  const [decisiones, setDecisiones] = useState<Map<number, Decision>>(new Map());

  // Todos los reportes del organismo, en cualquier estado (la sección «Todos los reportes» y su total).
  const todos = useQuery({
    queryKey: ['reportesDelOrganismo'],
    queryFn: () => reportes.delOrganismo().catch((error: unknown) => Promise.reject(aErrorApi(error))),
  });
  // Lo que cambia los estados (una decisión o un procesamiento con IA) también cambia este listado.
  const actualizarListas = () => {
    void consulta.invalidateQueries({ queryKey: ['reportesPendientes'] });
    void consulta.invalidateQueries({ queryKey: ['reportesDelOrganismo'] });
  };

  const revisar = useMutation({
    mutationFn: ({
      id,
      decision,
      comentario,
    }: {
      id: number;
      decision: DecisionRevision;
      comentario: string;
    }) => reportes.revisar(id, decision, comentario),
    // El reporte quedó decidido: las listas se vuelven a pedir.
    onSuccess: actualizarListas,
    onError: (error) => {
      // 409: otro operador lo revisó primero. La lista se refresca y el reporte deja de estar pendiente.
      if (aErrorApi(error).codigo === 'REPORTE_YA_REVISADO') actualizarListas();
    },
  });

  // Al abrir la pantalla se muestra el último procesamiento con IA (o el que sigue en curso).
  const recientes = useQuery({
    queryKey: ['procesosIa'],
    queryFn: () => ia.procesos().catch((error: unknown) => Promise.reject(aErrorApi(error))),
  });
  const idMostrado = procesoId ?? recientes.data?.[0]?.id ?? null;

  const proceso = useQuery({
    queryKey: ['procesoIa', idMostrado],
    queryFn: () => ia.proceso(idMostrado!).catch((error: unknown) => Promise.reject(aErrorApi(error))),
    enabled: idMostrado !== null,
    refetchInterval: (query) => (query.state.data?.enCurso === false ? false : INTERVALO_MS),
  });

  // Cuando la IA termina, la lista de pendientes cambió: los que publicó ya no están.
  const enCurso = proceso.data?.enCurso ?? false;
  useEffect(() => {
    if (!proceso.data || enCurso) return;
    void consulta.invalidateQueries({ queryKey: ['reportesPendientes'] });
    void consulta.invalidateQueries({ queryKey: ['reportesDelOrganismo'] });
  }, [enCurso, proceso.data, consulta]);

  const procesar = useMutation({
    mutationFn: () => ia.procesarCola(),
    onSuccess: ({ procesoId: id }) => {
      setProcesoId(id);
      void consulta.invalidateQueries({ queryKey: ['procesosIa'] });
    },
  });

  // Si falla la lista de procesamientos o el que se muestra, se dice, en vez de «todavía no se procesó la cola».
  const errorProceso = proceso.data ? null : idMostrado === null ? recientes.error : proceso.error;

  return {
    pendientes,
    filas,
    decisiones,
    anotarDecision: (id: number, decision: Decision) =>
      setDecisiones((actuales) => new Map(actuales).set(id, decision)),
    todos,
    revisar,
    proceso,
    errorProceso,
    reintentarProceso: () => void (idMostrado === null ? recientes.refetch() : proceso.refetch()),
    procesar,
    enCurso,
    /** El procesamiento lanzado desde esta pantalla (no uno anterior): sus pasos se ven en cada pendiente. */
    procesoDeSesion: procesoId !== null && proceso.data?.id === procesoId ? proceso.data : undefined,
    /** Saca de la lista lo resuelto y olvida el procesamiento y las decisiones de esta pantalla. */
    limpiarResueltos: () => {
      setFilas(pendientes.data ?? []);
      setDecisiones(new Map());
      setProcesoId(null);
    },
  };
}

/** Las filas que ya estaban, actualizadas con la lista nueva y con los pendientes que llegaron, en orden. */
function sumar(actuales: ReportePendiente[], nuevos: ReportePendiente[]) {
  const porId = new Map(actuales.map((fila) => [fila.id, fila]));
  for (const reporte of nuevos) porId.set(reporte.id, reporte);
  return [...porId.values()].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn) || a.id - b.id);
}
