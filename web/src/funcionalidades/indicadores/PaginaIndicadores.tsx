import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { useAreas } from '../bandeja/useGestion.js';
import { hoy, periodoInicial, validarPeriodo } from '../informes/formato.js';
import { SeccionInforme } from '../informes/SeccionInforme.js';
import { decimal, resumen, sinDatos } from './formato.js';
import { GraficoBarrios, GraficoPorEstado, GraficoPorSemana, GraficoTiempoDeResolucion } from './Graficos.js';
import { LeyendaCalor, MapaCalor } from './MapaCalor.js';
import type { FiltrosIndicadores, Indicadores } from './tipos.js';
import { useCalor, useIndicadores } from './useIndicadores.js';

/**
 * El panel de indicadores (F13) con el informe de la IA (F14) abajo: arriba los números y los gráficos del
 * organismo, abajo lo que la IA concluye de esos mismos números. Un solo juego de filtros para todo.
 */
export function PaginaIndicadores() {
  const [inicial] = useState(() => periodoInicial());
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [areaId, setAreaId] = useState('');
  const { areas } = useAreas();

  // Con un período inválido no se pide nada: se muestra el error en el campo.
  const errores = validarPeriodo(desde, hasta);
  const filtros: FiltrosIndicadores | null =
    Object.keys(errores).length === 0 ? { desde, hasta, areaId: areaId ? Number(areaId) : null } : null;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Indicadores</h1>
          <p className="text-sm text-texto-secundario">
            Cómo viene tu organismo en un período: cuánto entra, cuánto se resuelve, cuánto tarda y dónde se
            concentran los problemas.
          </p>
        </div>
        <form
          onSubmit={(evento) => evento.preventDefault()}
          noValidate
          aria-label="Filtros de los indicadores"
          className="tarjeta grid gap-4 p-4 sm:grid-cols-3"
        >
          <Campo
            id="indicadores-desde"
            etiqueta="Desde"
            type="date"
            value={desde}
            max={hoy()}
            onChange={(evento) => setDesde(evento.target.value)}
            error={errores.desde}
          />
          <Campo
            id="indicadores-hasta"
            etiqueta="Hasta"
            type="date"
            value={hasta}
            max={hoy()}
            onChange={(evento) => setHasta(evento.target.value)}
            error={errores.hasta}
          />
          <CampoSelecto
            id="indicadores-area"
            etiqueta="Área"
            value={areaId}
            onChange={(evento) => setAreaId(evento.target.value)}
          >
            <option value="">Todo el organismo</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </CampoSelecto>
        </form>
      </div>

      <Panel filtros={filtros} />
      <SeccionInforme filtros={filtros} />
    </section>
  );
}

function Panel({ filtros }: { filtros: FiltrosIndicadores | null }) {
  const indicadores = useIndicadores(filtros);

  if (!filtros) return null;
  if (indicadores.isPending) return <Cargando filas={6} />;
  if (indicadores.isError) {
    return (
      <AvisoError
        error={indicadores.error}
        alReintentar={() => void indicadores.refetch()}
        reintentando={indicadores.isFetching}
      />
    );
  }

  const { data } = indicadores;
  if (sinDatos(data)) {
    return (
      <p className="tarjeta p-8 text-center text-sm text-texto-secundario">
        No hay datos en este período: ningún incidente entró, se resolvió ni sigue abierto, y no llegaron
        reportes. Probá con un período más largo o con otra área.
      </p>
    );
  }

  return (
    <div
      aria-busy={indicadores.isFetching}
      className={`flex flex-col gap-4 transition-opacity ${indicadores.isPlaceholderData ? 'opacity-60' : ''}`}
    >
      <h2 className="sr-only">Indicadores del período</h2>
      <Tarjetas indicadores={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoPorSemana semanas={data.nuevosYResueltosPorSemana} />
        <GraficoPorEstado abiertos={data.abiertosPorEstado} />
        <GraficoTiempoDeResolucion tiempos={data.tiempoDeResolucion} />
        <GraficoBarrios barrios={data.barriosConMasAbiertos} />
      </div>
      <Calor filtros={filtros} />
    </div>
  );
}

/** Los cuatro números de arriba, para leer el período de un vistazo. */
function Tarjetas({ indicadores }: { indicadores: Indicadores }) {
  const { abiertos, nuevos, resueltos, desestimados } = resumen(indicadores);
  const tarjetas = [
    {
      titulo: 'Abiertos',
      valor: String(abiertos),
      detalle: 'Entraron en el período y siguen abiertos (sin los caducados)',
    },
    {
      titulo: 'Nuevos',
      valor: String(nuevos),
      detalle: 'Entraron en el período, también los que después caducaron',
    },
    { titulo: 'Resueltos', valor: String(resueltos), detalle: 'Incidentes resueltos en el período' },
    {
      titulo: 'Reportes desestimados',
      valor: desestimados.porcentaje === null ? '—' : `${decimal(desestimados.porcentaje)} %`,
      detalle:
        desestimados.porcentaje === null
          ? 'No llegaron reportes en el período'
          : `${desestimados.desestimados} de ${desestimados.total} reportes recibidos`,
    },
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tarjetas.map((tarjeta) => (
        <div key={tarjeta.titulo} className="tarjeta p-4">
          <dt className="text-sm text-texto-secundario">{tarjeta.titulo}</dt>
          <dd className="text-3xl font-semibold tabular-nums text-texto">{tarjeta.valor}</dd>
          <dd className="text-xs text-texto-secundario">{tarjeta.detalle}</dd>
        </div>
      ))}
    </dl>
  );
}

function Calor({ filtros }: { filtros: FiltrosIndicadores }) {
  const calor = useCalor(filtros);
  const puntos = calor.data ?? [];
  return (
    <section aria-label="Mapa de calor" className="tarjeta flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-texto">Mapa de calor</h3>
          <p className="text-xs text-texto-secundario">
            Dónde se concentran los incidentes abiertos del período, pesados por su prioridad
          </p>
        </div>
        <LeyendaCalor />
      </div>
      {calor.isError ? (
        <AvisoError
          error={calor.error}
          alReintentar={() => void calor.refetch()}
          reintentando={calor.isFetching}
        />
      ) : calor.isPending ? (
        <Cargando filas={4} />
      ) : puntos.length === 0 ? (
        <p className="py-8 text-center text-sm text-texto-secundario">
          No hay incidentes abiertos del período para mostrar en el mapa.
        </p>
      ) : (
        <>
          <div className="h-96 overflow-hidden rounded-md" aria-hidden="true">
            <MapaCalor puntos={puntos} />
          </div>
          <p className="text-sm text-texto-secundario">
            {puntos.length === 1
              ? '1 incidente abierto en el mapa.'
              : `${puntos.length} incidentes abiertos en el mapa.`}
          </p>
        </>
      )}
    </section>
  );
}
