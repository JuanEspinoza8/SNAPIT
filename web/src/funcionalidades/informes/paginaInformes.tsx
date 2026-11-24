import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import type { ErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { useAreas } from '../bandeja/useGestion.js';
import {
  type ErroresPeriodo,
  hoy,
  momento,
  partirContenido,
  periodo,
  periodoInicial,
  validarPeriodo,
} from './formato.js';
import type { Informe, PedidoInforme, ResumenInforme } from './tipos.js';
import { useBarrios, useDescargarPdf, useGenerarInforme, useHistorial, useInforme } from './useInformes.js';

const BOTON_PRIMARIO =
  'rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-60';
const BOTON_SECUNDARIO =
  'rounded-md border border-borde bg-superficie px-3 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna disabled:text-texto-secundario';

/** Con la IA caída, un error del servidor o sin conexión vale la pena reintentar; con datos inválidos, no. */
const sePuedeReintentar = (error: ErrorApi) => error.status === undefined || error.status >= 500;

/** F14: pedir un informe de estado y prioridades a la IA, leerlo, bajarlo en PDF y ver los anteriores. */
export function PaginaInformes() {
  const [parametros, setParametros] = useSearchParams();
  const id = Number(parametros.get('id')) || null;
  // El informe abierto vive en la URL: el link se puede compartir y el botón «atrás» vuelve al anterior.
  const abrir = (informeId: number) => setParametros({ id: String(informeId) });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Informes</h1>
        <p className="text-sm text-texto-secundario">
          Un análisis del estado de tu organismo en un período, escrito por la IA a partir de los indicadores:
          dónde están los problemas, qué tarda más y qué conviene atender primero.
        </p>
      </div>

      <FormularioInforme alGenerar={(informe) => abrir(informe.id)} />
      {id !== null && <VistaInforme id={id} />}
      <Historial abierto={id} alAbrir={abrir} />
    </section>
  );
}

type CampoInforme = 'desde' | 'hasta' | 'areaId' | 'barrio';

function FormularioInforme({ alGenerar }: { alGenerar: (informe: Informe) => void }) {
  const [inicial] = useState(() => periodoInicial());
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [areaId, setAreaId] = useState('');
  const [barrio, setBarrio] = useState('');
  const [erroresPeriodo, setErroresPeriodo] = useState<ErroresPeriodo>({});
  const { areas } = useAreas();
  const barrios = useBarrios();
  const generar = useGenerarInforme(alGenerar);

  const errorDelServidor = generar.error
    ? repartirErrores<CampoInforme>(generar.error, {
        desde: 'desde',
        hasta: 'hasta',
        areaId: 'areaId',
        barrio: 'barrio',
      })
    : null;
  const errores: Partial<Record<CampoInforme, string>> = { ...errorDelServidor?.porCampo, ...erroresPeriodo };

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const encontrados = validarPeriodo(desde, hasta);
    setErroresPeriodo(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    const pedido: PedidoInforme = {
      desde,
      hasta,
      areaId: areaId ? Number(areaId) : null,
      barrio: barrio || null,
    };
    generar.mutate(pedido);
  }

  const esperando = generar.isPending;
  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-busy={esperando}
      className="flex flex-col gap-4 rounded-lg border border-borde p-4"
    >
      <h2 className="text-lg font-semibold text-texto">Nuevo informe</h2>
      <fieldset disabled={esperando} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Período, área y barrio</legend>
        <Campo
          id="informe-desde"
          etiqueta="Desde"
          type="date"
          value={desde}
          max={hoy()}
          onChange={(evento) => setDesde(evento.target.value)}
          error={errores.desde}
        />
        <Campo
          id="informe-hasta"
          etiqueta="Hasta"
          type="date"
          value={hasta}
          max={hoy()}
          onChange={(evento) => setHasta(evento.target.value)}
          error={errores.hasta}
        />
        <CampoSelecto
          id="informe-area"
          etiqueta="Área"
          value={areaId}
          onChange={(evento) => setAreaId(evento.target.value)}
          error={errores.areaId}
        >
          <option value="">Todo el organismo</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.nombre}
            </option>
          ))}
        </CampoSelecto>
        <CampoSelecto
          id="informe-barrio"
          etiqueta="Barrio"
          value={barrio}
          onChange={(evento) => setBarrio(evento.target.value)}
          error={errores.barrio}
        >
          <option value="">Todos los barrios</option>
          {barrios.data?.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </CampoSelecto>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={esperando} className={BOTON_PRIMARIO}>
          {esperando ? 'Generando…' : 'Generar informe'}
        </button>
        {esperando && (
          <p role="status" className="flex items-center gap-2 text-sm text-texto-secundario">
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-borde border-t-primario motion-reduce:animate-none"
            />
            La IA está escribiendo el informe. Puede tardar hasta un minuto: no cierres esta página.
          </p>
        )}
      </div>

      {generar.error && (!errorDelServidor || errorDelServidor.sinCampo) && (
        <AvisoError
          error={generar.error}
          alReintentar={
            sePuedeReintentar(generar.error) && generar.variables
              ? () => generar.mutate(generar.variables!)
              : undefined
          }
          reintentando={esperando}
        />
      )}
    </form>
  );
}

function VistaInforme({ id }: { id: number }) {
  const informe = useInforme(id);
  const pdf = useDescargarPdf();

  if (informe.isPending) return <Cargando filas={6} />;
  if (informe.isError) {
    return (
      <AvisoError
        error={informe.error}
        alReintentar={sePuedeReintentar(informe.error) ? () => void informe.refetch() : undefined}
        reintentando={informe.isFetching}
      />
    );
  }

  const { data } = informe;
  return (
    <article
      aria-labelledby="titulo-informe"
      className="flex flex-col gap-4 rounded-lg border border-borde p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-informe" className="text-lg font-semibold text-texto">
            Informe {periodo(data)}
          </h2>
          <p className="text-sm text-texto-secundario">{descripcion(data)}</p>
        </div>
        <button
          type="button"
          onClick={() => pdf.descargar(data)}
          disabled={pdf.descargando}
          className={BOTON_SECUNDARIO}
        >
          {pdf.descargando ? 'Bajando el PDF…' : 'Descargar PDF'}
        </button>
      </header>
      {pdf.error && (
        <AvisoError
          error={pdf.error}
          alReintentar={() => pdf.descargar(data)}
          reintentando={pdf.descargando}
        />
      )}
      {partirContenido(data.contenido).map((seccion, indice) => (
        <section key={indice} className="flex flex-col gap-2">
          {seccion.titulo && <h3 className="font-semibold text-texto">{seccion.titulo}</h3>}
          {seccion.parrafos.map((parrafo, i) => (
            <p key={i} className="text-sm leading-relaxed text-texto">
              {parrafo}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}

/** «Bacheo · Centro · pedido por Olga el 23/11/2026, 14:05». */
function descripcion(informe: ResumenInforme) {
  return [
    informe.area?.nombre ?? 'Todo el organismo',
    informe.barrio ?? 'Todos los barrios',
    `pedido por ${informe.solicitante?.nombre ?? 'una cuenta borrada'} el ${momento(informe.creadoEn)}`,
  ].join(' · ');
}

function Historial({ abierto, alAbrir }: { abierto: number | null; alAbrir: (id: number) => void }) {
  const historial = useHistorial();
  return (
    <section aria-labelledby="titulo-historial" className="flex flex-col gap-3">
      <h2 id="titulo-historial" className="text-lg font-semibold text-texto">
        Informes anteriores
      </h2>
      {historial.isPending && <Cargando filas={3} />}
      {historial.isError && (
        <AvisoError
          error={historial.error}
          alReintentar={() => void historial.refetch()}
          reintentando={historial.isFetching}
        />
      )}
      {historial.data?.length === 0 && (
        <p className="text-sm text-texto-secundario">Todavía no se pidió ningún informe en tu organismo.</p>
      )}
      {historial.data && historial.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-borde">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Informes del organismo, del más nuevo al más viejo</caption>
            <thead className="bg-superficie-alterna text-xs text-texto-secundario">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Período
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Área y barrio
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Pedido por
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Cuándo
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {historial.data.map((informe) => (
                <tr
                  key={informe.id}
                  aria-current={informe.id === abierto ? 'true' : undefined}
                  className={`border-t border-borde ${informe.id === abierto ? 'bg-superficie-alterna' : ''}`}
                >
                  <td className="px-3 py-2 text-texto">{periodo(informe)}</td>
                  <td className="px-3 py-2 text-texto">
                    {informe.area?.nombre ?? 'Todo el organismo'}
                    {informe.barrio && <span className="text-texto-secundario"> · {informe.barrio}</span>}
                  </td>
                  <td className="px-3 py-2 text-texto">{informe.solicitante?.nombre ?? 'Cuenta borrada'}</td>
                  <td className="px-3 py-2 text-texto-secundario">{momento(informe.creadoEn)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => alAbrir(informe.id)}
                      aria-label={`Ver el informe ${periodo(informe)}`}
                      className="font-semibold text-primario hover:underline"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
