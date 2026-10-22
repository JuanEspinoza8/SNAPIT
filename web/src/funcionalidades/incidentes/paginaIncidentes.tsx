import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { crearRepositorioIncidentes } from '../../compartido/red/repositorioIncidentes.js';
import { crearRepositorioReportes } from '../../compartido/red/repositorioReportes.js';
import { Modal } from '../revision/Modal.js';
import { severidadEnTexto, type ReporteDelOrganismo } from '../revision/tipos.js';

/** Un incidente armado con sus reportes, a partir de GET /api/reportes. */
interface Incidente {
  id: number;
  estado: string;
  principalId: number | null;
  categoria: string;
  direccion: string | null;
  lat: number;
  lon: number;
  reportes: ReporteDelOrganismo[];
}

const ABIERTOS = new Set(['REGISTRADO', 'VERIFICADO', 'DERIVADO', 'EN_EJECUCION']);

function agruparPorIncidente(reportes: ReporteDelOrganismo[]) {
  const porId = new Map<number, Incidente>();
  // Del más viejo al más nuevo: el primer reporte da la categoría y el punto del incidente.
  for (const reporte of [...reportes].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn))) {
    if (!reporte.incidente) continue;
    // El servidor pone cada reporte en el principal; propioId dice de qué incidente vino si se unió a otro.
    const propio = reporte.incidente.propioId ?? reporte.incidente.id;
    const actual = porId.get(propio);
    if (actual) {
      actual.reportes.push(reporte);
      continue;
    }
    porId.set(propio, {
      id: propio,
      estado: reporte.incidente.estado,
      principalId: propio === reporte.incidente.id ? null : reporte.incidente.id,
      categoria: reporte.categoria.nombre,
      direccion: reporte.direccion,
      lat: reporte.lat,
      lon: reporte.lon,
      reportes: [reporte],
    });
  }
  return [...porId.values()].sort((a, b) => b.id - a.id);
}

/** Distancia aproximada en metros (haversine), para ordenar los candidatos a principal. */
function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

const distanciaEnTexto = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

type Accion =
  | { tipo: 'separar'; reporte: ReporteDelOrganismo; incidente: Incidente }
  | { tipo: 'unir'; incidente: Incidente }
  | null;

/** F05: el operador corrige la agrupación automática separando reportes y uniendo incidentes. */
export function PaginaIncidentes() {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const reportes = useMemo(() => crearRepositorioReportes(cliente), [cliente]);
  const incidentes = useMemo(() => crearRepositorioIncidentes(cliente), [cliente]);
  const [accion, setAccion] = useState<Accion>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const todos = useQuery({
    queryKey: ['reportesDelOrganismo'],
    queryFn: () => reportes.delOrganismo().catch((error: unknown) => Promise.reject(aErrorApi(error))),
  });

  const listo = (texto: string) => {
    setAccion(null);
    setAviso(texto);
    void consulta.invalidateQueries({ queryKey: ['reportesDelOrganismo'] });
    void consulta.invalidateQueries({ queryKey: ['reportesPendientes'] });
    void consulta.invalidateQueries({ queryKey: ['incidentes'] });
  };

  const separar = useMutation({
    mutationFn: ({ reporteId, comentario }: { reporteId: number; comentario: string }) =>
      incidentes.separarReporte(reporteId, comentario),
    onSuccess: (r) =>
      listo(
        `El reporte #${r.reporteId} quedó solo en el incidente nuevo #${r.incidenteNuevo.id}. ` +
          `El #${r.incidenteOriginal.id} quedó con ${r.incidenteOriginal.cantidadReportes} reporte(s).`,
      ),
  });
  const unir = useMutation({
    mutationFn: ({ id, principalId, comentario }: { id: number; principalId: number; comentario: string }) =>
      incidentes.unir(id, principalId, comentario),
    onSuccess: (r) =>
      listo(
        `El incidente #${r.id} quedó unido al #${r.principal.id}, que ahora suma ` +
          `${r.principal.cantidadReportes} reportes (severidad ${r.principal.severidad.toLowerCase()}).`,
      ),
  });
  const deshacer = useMutation({
    mutationFn: (id: number) => incidentes.deshacerUnion(id),
    onSuccess: (r) => listo(`Se deshizo la unión: el #${r.id} volvió a ser un incidente aparte.`),
  });

  const lista = useMemo(() => agruparPorIncidente(todos.data ?? []), [todos.data]);
  const principales = lista.filter((incidente) => incidente.principalId === null);
  const unidosA = (id: number) => lista.filter((incidente) => incidente.principalId === id);

  if (todos.isPending) return <Cargando />;
  if (todos.isError) {
    return (
      <AvisoError
        error={aErrorApi(todos.error)}
        alReintentar={() => void todos.refetch()}
        reintentando={todos.isFetching}
      />
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Incidentes</h1>
        <p className="text-texto-secundario">
          El sistema agrupa solo los reportes del mismo problema. Si se equivocó, separá un reporte o uní dos
          incidentes que son el mismo.
        </p>
      </div>

      {aviso && (
        <p
          role="status"
          className="rounded-md border border-primario bg-superficie-alterna px-3 py-2 text-sm text-primario"
        >
          {aviso}
        </p>
      )}
      {deshacer.isError && <AvisoError error={aErrorApi(deshacer.error)} />}

      {principales.length === 0 && <p className="text-texto-secundario">Todavía no hay incidentes.</p>}

      <ul className="space-y-4">
        {principales.map((incidente) => {
          const unidos = unidosA(incidente.id);
          const reportesTotales =
            incidente.reportes.length + unidos.reduce((n, u) => n + u.reportes.length, 0);
          return (
            <li key={incidente.id} className="rounded-lg border border-borde bg-superficie p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-texto">
                    #{incidente.id} · {incidente.categoria}
                  </p>
                  <p className="text-sm text-texto-secundario">
                    {incidente.direccion ?? 'Sin dirección todavía'} · {incidente.estado.toLowerCase()} ·{' '}
                    <strong>{reportesTotales}</strong> reporte(s)
                    {unidos.length > 0 && ' contando los unidos'}
                  </p>
                </div>
                {ABIERTOS.has(incidente.estado) && unidos.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      unir.reset();
                      setAccion({ tipo: 'unir', incidente });
                    }}
                    className="rounded-md border border-borde px-3 py-1.5 text-sm font-semibold text-primario hover:bg-superficie-alterna"
                  >
                    Unir a otro…
                  </button>
                )}
              </div>

              <ListaReportes
                reportes={incidente.reportes}
                puedeSeparar={reportesTotales > 1}
                alSeparar={(reporte) => {
                  separar.reset();
                  setAccion({ tipo: 'separar', reporte, incidente });
                }}
              />

              {unidos.map((unido) => (
                <div key={unido.id} className="mt-3 rounded-md border border-dashed border-borde p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-texto">
                      Unido a este: <strong>#{unido.id}</strong> · {unido.categoria} · {unido.reportes.length}{' '}
                      reporte(s)
                    </p>
                    <button
                      type="button"
                      disabled={deshacer.isPending}
                      onClick={() => deshacer.mutate(unido.id)}
                      className="rounded-md border border-borde px-3 py-1 text-sm text-peligro hover:bg-superficie-alterna disabled:opacity-50"
                    >
                      Deshacer unión
                    </button>
                  </div>
                  <ListaReportes reportes={unido.reportes} puedeSeparar={false} alSeparar={() => {}} />
                </div>
              ))}
            </li>
          );
        })}
      </ul>

      {accion?.tipo === 'separar' && (
        <Modal
          titulo={`Separar el reporte #${accion.reporte.id}`}
          ancho="max-w-md"
          alCerrar={() => setAccion(null)}
        >
          <FormularioComentario
            explicacion={`Sale del incidente #${accion.incidente.id} y queda solo en un incidente nuevo, con su categoría y su ubicación.`}
            textoBoton="Separar"
            enviando={separar.isPending}
            error={separar.isError ? separar.error : null}
            alEnviar={(comentario) => separar.mutate({ reporteId: accion.reporte.id, comentario })}
          />
        </Modal>
      )}

      {accion?.tipo === 'unir' && (
        <Modal
          titulo={`Unir el incidente #${accion.incidente.id}`}
          ancho="max-w-lg"
          alCerrar={() => setAccion(null)}
        >
          <FormularioUnir
            incidente={accion.incidente}
            candidatos={principales.filter((i) => i.id !== accion.incidente.id && ABIERTOS.has(i.estado))}
            enviando={unir.isPending}
            error={unir.isError ? unir.error : null}
            alEnviar={(principalId, comentario) =>
              unir.mutate({ id: accion.incidente.id, principalId, comentario })
            }
          />
        </Modal>
      )}
    </section>
  );
}

function ListaReportes({
  reportes,
  puedeSeparar,
  alSeparar,
}: {
  reportes: ReporteDelOrganismo[];
  puedeSeparar: boolean;
  alSeparar: (reporte: ReporteDelOrganismo) => void;
}) {
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {reportes.map((reporte) => (
        <li key={reporte.id} className="flex gap-3 rounded-md bg-superficie-alterna p-2">
          {reporte.fotos[0] ? (
            <FotoConSesion
              fotoId={reporte.fotos[0].id}
              className="h-16 w-20 shrink-0 rounded object-cover"
              siFalla={<div className="h-16 w-20 shrink-0 rounded bg-borde" />}
            />
          ) : (
            <div className="h-16 w-20 shrink-0 rounded bg-borde" />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-texto">
              Reporte #{reporte.id} · {severidadEnTexto[reporte.severidadDeclarada]}
            </p>
            <p className="truncate text-texto-secundario">
              {reporte.descripcion ?? reporte.categoria.nombre}
            </p>
            <p className="text-xs text-texto-secundario">
              {new Date(reporte.registradoEn).toLocaleString('es-AR')} ·{' '}
              {reporte.estadoVerificacion.toLowerCase().replace('_', ' ')}
            </p>
          </div>
          {puedeSeparar && reporte.estadoVerificacion !== 'DESESTIMADO' && (
            <button
              type="button"
              onClick={() => alSeparar(reporte)}
              className="self-center rounded-md border border-borde px-2 py-1 text-xs font-semibold text-primario hover:bg-superficie"
            >
              Separar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function CampoComentario({ valor, alCambiar }: { valor: string; alCambiar: (texto: string) => void }) {
  return (
    <div className="space-y-1">
      <label htmlFor="comentario" className="block text-sm font-semibold text-texto">
        Comentario (opcional)
      </label>
      <textarea
        id="comentario"
        rows={2}
        maxLength={1000}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-texto focus:border-primario focus:outline-none"
      />
    </div>
  );
}

function FormularioComentario(props: {
  explicacion: string;
  textoBoton: string;
  enviando: boolean;
  error: unknown;
  alEnviar: (comentario: string) => void;
}) {
  const [comentario, setComentario] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-secundario">{props.explicacion}</p>
      <CampoComentario valor={comentario} alCambiar={setComentario} />
      {props.error != null && <AvisoError error={aErrorApi(props.error)} />}
      <button
        type="button"
        disabled={props.enviando}
        onClick={() => props.alEnviar(comentario)}
        className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
      >
        {props.enviando ? 'Guardando…' : props.textoBoton}
      </button>
    </div>
  );
}

function FormularioUnir(props: {
  incidente: Incidente;
  candidatos: Incidente[];
  enviando: boolean;
  error: unknown;
  alEnviar: (principalId: number, comentario: string) => void;
}) {
  // Los más cercanos primero: lo normal es unir dos incidentes del mismo lugar.
  const candidatos = useMemo(
    () =>
      props.candidatos
        .map((candidato) => ({ candidato, distancia: metros(props.incidente, candidato) }))
        .sort((a, b) => a.distancia - b.distancia),
    [props.candidatos, props.incidente],
  );
  const [principalId, setPrincipalId] = useState<number | null>(candidatos[0]?.candidato.id ?? null);
  const [comentario, setComentario] = useState('');

  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-secundario">
        Elegí el incidente principal: es el mismo problema. El #{props.incidente.id} deja de verse en el mapa
        y sus reportes cuentan en el principal. Se puede deshacer.
      </p>
      {candidatos.length === 0 ? (
        <p className="text-sm text-texto-secundario">No hay otros incidentes abiertos para unir.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {candidatos.map(({ candidato, distancia }) => (
            <li key={candidato.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-superficie-alterna">
                <input
                  type="radio"
                  name="principal"
                  checked={principalId === candidato.id}
                  onChange={() => setPrincipalId(candidato.id)}
                />
                <span>
                  <strong>#{candidato.id}</strong> · {candidato.categoria} · a {distanciaEnTexto(distancia)}
                  <span className="block text-xs text-texto-secundario">
                    {candidato.direccion ?? 'Sin dirección'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <CampoComentario valor={comentario} alCambiar={setComentario} />
      {props.error != null && <AvisoError error={aErrorApi(props.error)} />}
      <button
        type="button"
        disabled={props.enviando || principalId === null}
        onClick={() => principalId !== null && props.alEnviar(principalId, comentario)}
        className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
      >
        {props.enviando ? 'Uniendo…' : `Unir al #${principalId ?? '—'}`}
      </button>
    </div>
  );
}
