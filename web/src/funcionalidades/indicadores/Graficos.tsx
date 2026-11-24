import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ESTADOS } from '../mapa/estados.js';
import { decimal, dias, semanaCorta } from './formato.js';
import type { Indicadores } from './tipos.js';

// Los colores salen de los tokens de tema.css: con el tema oscuro cambian solos.
const EJE = { fontSize: 12, fill: 'var(--color-texto-secundario)' };
const GRILLA = 'var(--color-borde)';
const TOOLTIP = {
  contentStyle: {
    background: 'var(--color-superficie)',
    border: '1px solid var(--color-borde)',
    borderRadius: 6,
    fontSize: 12,
    color: 'var(--color-texto)',
  },
  labelStyle: { color: 'var(--color-texto)', fontWeight: 600 },
  itemStyle: { color: 'var(--color-texto)' },
  cursor: { fill: 'var(--color-superficie-alterna)' },
};
const CLASE_ESTADO: Record<string, string> = {
  REGISTRADO: 'var(--color-estado-registrado)',
  VERIFICADO: 'var(--color-estado-verificado)',
  DERIVADO: 'var(--color-estado-derivado)',
  EN_EJECUCION: 'var(--color-estado-en-ejecucion)',
};
// Barras finas con la punta redondeada; las del mismo gráfico separadas.
const PUNTA = 4;

interface PropsTarjeta {
  titulo: string;
  /** Qué mide y en qué unidad, debajo del título. */
  unidad: string;
  /** Sin datos se muestra este texto en lugar del gráfico. */
  vacio: string | null;
  /** El mismo dato en texto: la tabla para quien no ve el gráfico o lo quiere exacto. */
  tabla: ReactNode;
  children: ReactNode;
  /** Algo para elegir arriba del gráfico, como «por área / por categoría». */
  controles?: ReactNode;
}

/** Cada gráfico con su título, sus unidades y sus datos en una tabla que se despliega. */
export function TarjetaGrafico({ titulo, unidad, vacio, tabla, children, controles }: PropsTarjeta) {
  return (
    <section
      aria-label={titulo}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-borde bg-superficie p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-texto">{titulo}</h3>
          <p className="text-xs text-texto-secundario">{unidad}</p>
        </div>
        {controles}
      </div>
      {vacio ? (
        <p className="py-8 text-center text-sm text-texto-secundario">{vacio}</p>
      ) : (
        <>
          <div className="h-64" aria-hidden="true">
            {children}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-texto-secundario hover:text-texto">Ver los datos</summary>
            <div className="mt-2 overflow-x-auto">{tabla}</div>
          </details>
        </>
      )}
    </section>
  );
}

function Tabla({ titulo, columnas, filas }: { titulo: string; columnas: string[]; filas: ReactNode[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{titulo}</caption>
      <thead className="text-xs text-texto-secundario">
        <tr>
          {columnas.map((columna, i) => (
            <th key={columna} scope="col" className={`px-2 py-1 font-semibold ${i > 0 ? 'text-right' : ''}`}>
              {columna}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, i) => (
          <tr key={i} className="border-t border-borde">
            {fila.map((celda, j) => (
              <td key={j} className={`px-2 py-1 text-texto ${j > 0 ? 'text-right tabular-nums' : ''}`}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GraficoPorSemana({ semanas }: { semanas: Indicadores['nuevosYResueltosPorSemana'] }) {
  const titulo = 'Nuevos y resueltos por semana';
  const vacio = semanas.every((fila) => fila.nuevos === 0 && fila.resueltos === 0)
    ? 'No entró ni se resolvió ningún incidente en el período.'
    : null;
  const datos = semanas.map((fila) => ({ ...fila, etiqueta: semanaCorta(fila.semana) }));
  return (
    <TarjetaGrafico
      titulo={titulo}
      unidad="Incidentes por semana, de lunes a domingo"
      vacio={vacio}
      tabla={
        <Tabla
          titulo={titulo}
          columnas={['Semana del', 'Nuevos', 'Resueltos']}
          filas={datos.map((fila) => [fila.etiqueta, fila.nuevos, fila.resueltos])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={GRILLA} vertical={false} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: GRILLA }} />
          <YAxis allowDecimals={false} tick={EJE} tickLine={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP}
            cursor={{ stroke: GRILLA }}
            labelFormatter={(semana) => `Semana del ${semana}`}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, color: 'var(--color-texto-secundario)' }}
          />
          <Line
            type="monotone"
            dataKey="nuevos"
            name="Nuevos"
            stroke="var(--color-serie-1)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: 'var(--color-superficie)' }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="resueltos"
            name="Resueltos"
            stroke="var(--color-serie-2)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: 'var(--color-superficie)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </TarjetaGrafico>
  );
}

export function GraficoPorEstado({ abiertos }: { abiertos: Indicadores['abiertosPorEstado'] }) {
  const titulo = 'Abiertos por estado';
  const datos = abiertos.map((fila) => ({ ...fila, etiqueta: ESTADOS[fila.estado].etiqueta }));
  const vacio = datos.every((fila) => fila.cantidad === 0) ? 'No hay incidentes abiertos del período.' : null;
  return (
    <TarjetaGrafico
      titulo={titulo}
      unidad="Incidentes abiertos hoy que entraron en el período"
      vacio={vacio}
      tabla={
        <Tabla
          titulo={titulo}
          columnas={['Estado', 'Incidentes']}
          filas={datos.map((fila) => [fila.etiqueta, fila.cantidad])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 20, right: 8, bottom: 0, left: -16 }} barCategoryGap="30%">
          <CartesianGrid stroke={GRILLA} vertical={false} />
          <XAxis dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={{ stroke: GRILLA }} interval={0} />
          <YAxis allowDecimals={false} tick={EJE} tickLine={false} axisLine={false} />
          <Tooltip {...TOOLTIP} formatter={(valor) => [valor, 'Incidentes']} />
          <Bar dataKey="cantidad" radius={[PUNTA, PUNTA, 0, 0]} maxBarSize={48}>
            {datos.map((fila) => (
              <Cell key={fila.estado} fill={CLASE_ESTADO[fila.estado]} />
            ))}
            <LabelList
              dataKey="cantidad"
              position="top"
              style={{ fontSize: 12, fill: 'var(--color-texto)' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </TarjetaGrafico>
  );
}

/** Barras acostadas de una sola serie: los nombres largos (barrios, categorías) se leen enteros. */
function BarrasAcostadas({
  datos,
  valor,
  nombreValor,
  formato,
}: {
  datos: { nombre: string }[];
  valor: string;
  nombreValor: string;
  formato: (valor: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRILLA} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={EJE} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="nombre"
          width={130}
          tick={EJE}
          tickLine={false}
          axisLine={{ stroke: GRILLA }}
          interval={0}
        />
        <Tooltip {...TOOLTIP} formatter={(dato) => [formato(Number(dato)), nombreValor]} />
        <Bar dataKey={valor} fill="var(--color-serie-1)" radius={[0, PUNTA, PUNTA, 0]} maxBarSize={20}>
          <LabelList
            dataKey={valor}
            position="right"
            formatter={(dato) => formato(Number(dato))}
            style={{ fontSize: 12, fill: 'var(--color-texto)' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const MAXIMO_BARRAS = 8;

type Agrupado = 'porArea' | 'porCategoria' | 'porBarrio';
const AGRUPADOS: { valor: Agrupado; texto: string }[] = [
  { valor: 'porArea', texto: 'Por área' },
  { valor: 'porCategoria', texto: 'Por categoría' },
  { valor: 'porBarrio', texto: 'Por barrio' },
];

export function GraficoTiempoDeResolucion({ tiempos }: { tiempos: Indicadores['tiempoDeResolucion'] }) {
  const [agrupado, setAgrupado] = useState<Agrupado>('porArea');
  const titulo = 'Tiempo de resolución';
  const filas = (tiempos[agrupado] as (typeof tiempos)['porBarrio' | 'porArea'][number][]).map((fila) => ({
    nombre: 'barrio' in fila ? fila.barrio : fila.nombre,
    cantidad: fila.cantidad,
    medianaDias: fila.medianaDias,
    promedioDias: fila.promedioDias,
  }));
  return (
    <TarjetaGrafico
      titulo={titulo}
      unidad="Mediana de días desde el primer reporte, de los resueltos en el período. Primero lo que más tarda"
      vacio={filas.length === 0 ? 'No se resolvió ningún incidente en el período.' : null}
      controles={
        <div
          role="group"
          aria-label="Agrupar el tiempo de resolución"
          className="flex rounded-md border border-borde"
        >
          {AGRUPADOS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={agrupado === opcion.valor}
              onClick={() => setAgrupado(opcion.valor)}
              className={`px-2 py-1 text-xs ${
                agrupado === opcion.valor
                  ? 'bg-superficie-alterna font-semibold text-texto'
                  : 'text-texto-secundario hover:text-texto'
              }`}
            >
              {opcion.texto}
            </button>
          ))}
        </div>
      }
      tabla={
        <Tabla
          titulo={`${titulo}, ${AGRUPADOS.find((opcion) => opcion.valor === agrupado)!.texto.toLowerCase()}`}
          columnas={['', 'Resueltos', 'Mediana', 'Promedio']}
          filas={filas.map((fila) => [
            fila.nombre,
            fila.cantidad,
            dias(fila.medianaDias),
            dias(fila.promedioDias),
          ])}
        />
      }
    >
      <BarrasAcostadas
        datos={filas.slice(0, MAXIMO_BARRAS)}
        valor="medianaDias"
        nombreValor="Mediana"
        formato={(valor) => `${decimal(valor)} d`}
      />
    </TarjetaGrafico>
  );
}

export function GraficoBarrios({ barrios }: { barrios: Indicadores['barriosConMasAbiertos'] }) {
  const titulo = 'Barrios con más incidentes abiertos';
  const datos = barrios.map((fila) => ({ nombre: fila.barrio, cantidad: fila.cantidad }));
  return (
    <TarjetaGrafico
      titulo={titulo}
      unidad={`Incidentes abiertos hoy que entraron en el período, los ${MAXIMO_BARRAS} primeros`}
      vacio={datos.length === 0 ? 'Ningún incidente abierto del período tiene barrio todavía.' : null}
      tabla={
        <Tabla
          titulo={titulo}
          columnas={['Barrio', 'Incidentes']}
          filas={datos.map((fila) => [fila.nombre, fila.cantidad])}
        />
      }
    >
      <BarrasAcostadas
        datos={datos.slice(0, MAXIMO_BARRAS)}
        valor="cantidad"
        nombreValor="Incidentes"
        formato={(valor) => String(valor)}
      />
    </TarjetaGrafico>
  );
}
