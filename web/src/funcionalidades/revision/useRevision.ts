import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioIa } from '../../compartido/red/repositorioIa.js';
import { crearRepositorioReportes } from '../../compartido/red/repositorioReportes.js';
import type { DecisionRevision, ReportePendiente } from './tipos.js';

// Mientras la IA procesa, el log se vuelve a pedir cada tanto. Al terminar, deja de pedirse.
const INTERVALO_MS = 1500;

const LISTAS = ['reportesPendientes', 'desestimadosPendientes', 'reportesDelOrganismo'];

/** Todo error sale como ErrorApi: así la pantalla lo muestra igual siempre. */
const conError = <T>(promesa: Promise<T>) =>
  promesa.catch((error: unknown) => Promise.reject(aErrorApi(error)));

/**
 * Todo lo de la revisión: las tres listas, las decisiones del operador y el procesamiento con IA. Vive en la
 * página y no en cada pestaña: así, al ir a otra y volver, lo que hizo la IA sigue a la vista hasta «Listo».
 */
export function useRevision() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const reportes = useMemo(() => crearRepositorioReportes(cliente), [cliente]);
  const ia = useMemo(() => crearRepositorioIa(cliente), [cliente]);
  const actualizarListas = () => {
    for (const lista of LISTAS) void consulta.invalidateQueries({ queryKey: [lista] });
  };

  const pendientes = useQuery({
    queryKey: ['reportesPendientes'],
    queryFn: () => conError(reportes.pendientes()),
  });
  const desestimados = useQuery({
    queryKey: ['desestimadosPendientes'],
    queryFn: () => conError(reportes.desestimadosPendientes()),
  });
  const todos = useQuery({
    queryKey: ['reportesDelOrganismo'],
    queryFn: () => conError(reportes.delOrganismo()),
  });

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
    onSuccess: actualizarListas,
    onError: (error) => {
      // 409: otro operador lo revisó primero. Las listas se refrescan y el reporte deja de estar pendiente.
      if (aErrorApi(error).codigo === 'REPORTE_YA_REVISADO') actualizarListas();
    },
  });

  const confirmar = useMutation({
    mutationFn: () => reportes.confirmarDesestimados(),
    onSuccess: actualizarListas,
  });

  // El procesamiento que se muestra: el lanzado desde acá o, al abrir la pantalla, el último del organismo.
  const [procesoId, setProcesoId] = useState<string | null>(null);
  const recientes = useQuery({
    queryKey: ['procesosIa'],
    queryFn: () => conError(ia.procesos()),
  });
  const idMostrado = procesoId ?? recientes.data?.[0]?.id ?? null;
  const proceso = useQuery({
    queryKey: ['procesoIa', idMostrado],
    queryFn: () => conError(ia.proceso(idMostrado!)),
    enabled: idMostrado !== null,
    refetchInterval: (query) => (query.state.data?.enCurso === false ? false : INTERVALO_MS),
  });
  const enCurso = proceso.data?.enCurso ?? false;

  // Al terminar, las listas cambiaron: lo publicado sale de los pendientes y lo marcado pasa a desestimados.
  useEffect(() => {
    if (proceso.data && !enCurso) {
      for (const lista of LISTAS) void consulta.invalidateQueries({ queryKey: [lista] });
    }
  }, [enCurso, proceso.data, consulta]);

  const procesar = useMutation({
    mutationFn: () => ia.procesarCola(),
    onSuccess: ({ procesoId: id }) => {
      setProcesoId(id);
      void consulta.invalidateQueries({ queryKey: ['procesosIa'] });
    },
  });

  // Las filas de la sesión: los pendientes y los que la IA resolvió acá, que siguen a la vista con su resultado
  // hasta «Listo». Se ajustan al llegar una lista nueva, durante el render (el patrón de React para derivar de
  // otro estado: no con un efecto).
  const [filas, setFilas] = useState<ReportePendiente[]>([]);
  const [listaVista, setListaVista] = useState<ReportePendiente[] | undefined>(undefined);
  if (pendientes.data !== listaVista) {
    setListaVista(pendientes.data);
    if (pendientes.data) setFilas(sumar(filas, pendientes.data));
  }
  const procesoDeSesion = procesoId !== null && proceso.data?.id === procesoId ? proceso.data : undefined;
  const pendientesAhora = new Set(pendientes.data?.map((reporte) => reporte.id) ?? []);
  const conPasos = new Set(procesoDeSesion?.eventos.map((evento) => evento.reporte.id) ?? []);
  // Uno que dejó de estar pendiente sin pasar por la IA (lo decidió una persona) ya no tiene nada que mostrar.
  const filasVisibles = filas.filter((fila) => pendientesAhora.has(fila.id) || conPasos.has(fila.id));

  return {
    pendientes,
    desestimados,
    todos,
    filas: filasVisibles,
    revisar,
    confirmar,
    procesar,
    proceso: proceso.data,
    procesoDeSesion,
    enCurso,
    errorProceso: proceso.data ? null : idMostrado === null ? recientes.error : proceso.error,
    /** Olvida lo que hizo la IA en esta pantalla: quedan solo los pendientes. */
    listo: () => {
      setFilas(pendientes.data ?? []);
      setProcesoId(null);
    },
    hayResueltos: filasVisibles.some((fila) => !pendientesAhora.has(fila.id)),
  };
}

/** Las filas que ya estaban, actualizadas con la lista nueva y con los pendientes que llegaron, en orden. */
function sumar(actuales: ReportePendiente[], nuevos: ReportePendiente[]) {
  const porId = new Map(actuales.map((fila) => [fila.id, fila]));
  for (const reporte of nuevos) porId.set(reporte.id, reporte);
  return [...porId.values()].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn) || a.id - b.id);
}
