import { useState, type ReactNode } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useFocoConfirmacion } from '../../compartido/componentes/useFocoConfirmacion.js';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import type { ErrorApi } from '../../compartido/red/error.js';
import { controles, RESULTADO_CONTROL, type Control } from './estadoIa.js';
import { MapaChico } from './MapaChico.js';
import { botonPeligro, botonPrimario, botonSecundario, Etiqueta, fechaCorta } from './piezas.js';
import { severidadEnTexto, type DecisionRevision, type ReportePendiente } from './tipos.js';

/** Lo necesario para decidir. Sin esto, el detalle es de solo lectura (un reporte ya decidido). */
export interface Decidir {
  /** La IA está procesando: mientras tanto no se decide a mano. */
  bloqueado: boolean;
  /** Ya no está pendiente (lo decidió otra persona): no queda nada por decidir. */
  yaResuelto: boolean;
  enviando: DecisionRevision | null;
  error: ErrorApi | null;
  alDecidir: (decision: DecisionRevision, comentario: string) => void;
}

interface Props {
  reporte: ReportePendiente;
  /** La IA lo marcó para desestimar: su foto no muestra un problema de la vía pública. */
  marcado: boolean;
  decidir?: Decidir;
  /** Para un reporte ya decidido: en qué quedó, en lugar de los botones. */
  resultado?: ReactNode;
}

const MAX_COMENTARIO = 1000;

/** Todo lo que el operador necesita para publicar o desestimar un reporte: la foto, el lugar, la IA y los controles. */
export function DetalleReporte({ reporte, marcado, decidir, resultado }: Props) {
  const [fotoElegida, setFotoElegida] = useState(0);
  const foto = reporte.fotos[fotoElegida] ?? reporte.fotos[0];
  const { vecino } = reporte;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        {foto ? (
          <FotoConSesion
            key={foto.id}
            fotoId={foto.id}
            className="aspect-[4/3] w-full rounded-md object-cover"
            siFalla={<span className="aspect-[4/3] w-full rounded-md bg-superficie-alterna" />}
          />
        ) : (
          <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-superficie-alterna text-sm text-texto-secundario">
            Sin foto
          </span>
        )}
        {reporte.fotos.length > 1 && (
          <div className="flex gap-2">
            {reporte.fotos.map((otra, indice) => (
              <button
                key={otra.id}
                type="button"
                onClick={() => setFotoElegida(indice)}
                aria-label={`Ver la foto ${indice + 1}`}
                className={`rounded-md border-2 ${indice === fotoElegida ? 'border-primario' : 'border-transparent'}`}
              >
                <FotoConSesion
                  fotoId={otra.id}
                  className="h-12 w-16 rounded-md object-cover"
                  siFalla={null}
                />
              </button>
            ))}
          </div>
        )}
        <MapaChico lat={reporte.lat} lon={reporte.lon} />
      </div>

      <div className="flex flex-col gap-5 text-sm">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-texto">
            {reporte.categoria.nombre} · {severidadEnTexto[reporte.severidadDeclarada]}
          </p>
          {reporte.descripcion && <p className="text-texto">{reporte.descripcion}</p>}
          <p className="text-xs text-texto-secundario">
            {reporte.direccion ?? 'Dirección pendiente'} · {fechaCorta(reporte.registradoEn)} · desde{' '}
            {reporte.origen === 'APP_MOVIL' ? 'la app' : 'el sitio web'}
            {reporte.incidente && ` · incidente #${reporte.incidente.id}`}
          </p>
        </div>

        <Apartado titulo="La IA">
          <LoQueVioLaIa reporte={reporte} marcado={marcado} />
        </Apartado>

        <Apartado titulo="Controles">
          <ul className="flex flex-col gap-1.5">
            {controles(reporte.senales).map((control) => (
              <FilaControl key={control.nombre} control={control} />
            ))}
          </ul>
        </Apartado>

        <Apartado titulo="Vecino">
          <p className="text-texto">
            {vecino.reportesConfirmados}{' '}
            {vecino.reportesConfirmados === 1 ? 'reporte publicado' : 'reportes publicados'} ·{' '}
            {vecino.reportesDesestimados} {vecino.reportesDesestimados === 1 ? 'desestimado' : 'desestimados'}
          </p>
        </Apartado>

        {decidir ? <Decision decidir={decidir} marcado={marcado} /> : resultado}
      </div>
    </div>
  );
}

function LoQueVioLaIa({ reporte, marcado }: { reporte: ReportePendiente; marcado: boolean }) {
  const categorias = useCategorias();
  const propuesta = reporte.propuestaIa;
  if (!propuesta) return <p className="text-texto-secundario">Todavía no miró la foto.</p>;
  // Las fotos publicadas las ve cualquiera: una cara o una patente se mira antes de publicar.
  const privacidad = propuesta.datosPersonales === true && (
    <p role="note" className="rounded-md border border-peligro px-3 py-2 font-semibold text-texto">
      Se ve una cara o una patente: mirá la foto antes de publicarla.
    </p>
  );
  if (marcado || propuesta.categoriaId === null) {
    return (
      <>
        {privacidad}
        <p className="font-semibold text-peligro">No muestra un problema de la vía pública.</p>
        {propuesta.explicacion && <p className="text-texto-secundario">{propuesta.explicacion}</p>}
      </>
    );
  }
  const nombre =
    categorias.data?.find((categoria) => categoria.id === propuesta.categoriaId)?.nombre ??
    `Categoría ${propuesta.categoriaId}`;
  const coincide =
    propuesta.categoriaId === reporte.categoria.id && propuesta.severidad === reporte.severidadDeclarada;
  return (
    <>
      {privacidad}
      <p className="text-texto">
        Ve <span className="font-semibold">{nombre}</span>
        {propuesta.severidad && ` · ${severidadEnTexto[propuesta.severidad]}`}
        <span className="text-texto-secundario">
          {' '}
          — {coincide ? 'coincide con el vecino' : 'no coincide con el vecino'}
        </span>
      </p>
      {propuesta.explicacion && <p className="text-texto-secundario">{propuesta.explicacion}</p>}
    </>
  );
}

// El punto de color ayuda a encontrar de un vistazo el que no se cumple; lo que vale es el texto.
const PUNTOS: Record<Control['resultado'], string> = {
  BIEN: 'bg-estado-resuelto',
  MAL: 'bg-peligro',
  SIN_DATO: 'bg-borde',
};

function FilaControl({ control }: { control: Control }) {
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-texto">{control.nombre}</p>
        <Etiqueta punto={PUNTOS[control.resultado]}>{RESULTADO_CONTROL[control.resultado]}</Etiqueta>
      </div>
      {control.detalle && <p className="text-xs text-texto-secundario">{control.detalle}</p>}
    </li>
  );
}

function Apartado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">{titulo}</h3>
      {children}
    </section>
  );
}

function Decision({ decidir, marcado }: { decidir: Decidir; marcado: boolean }) {
  const [comentario, setComentario] = useState('');
  // Desestimar baja la reputación del vecino: se pide confirmar antes de mandarlo.
  const [confirmando, setConfirmando] = useState(false);
  const { botonAbrir, botonConfirmar } = useFocoConfirmacion(confirmando);
  const { enviando, error, bloqueado, yaResuelto, alDecidir } = decidir;
  const deshabilitado = bloqueado || yaResuelto || enviando !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-borde pt-4">
      <textarea
        aria-label="Comentario para la bitácora (opcional)"
        value={comentario}
        onChange={(evento) => setComentario(evento.target.value)}
        maxLength={MAX_COMENTARIO}
        rows={2}
        disabled={deshabilitado}
        className="rounded-md border border-borde bg-superficie p-2 text-sm text-texto disabled:opacity-50"
        placeholder="Comentario para la bitácora (opcional)"
      />
      {yaResuelto && (
        <p className="text-xs font-semibold text-texto-secundario">
          Este reporte ya no está pendiente: lo decidió otra persona.
        </p>
      )}
      {bloqueado && !yaResuelto && (
        <p className="text-xs text-texto-secundario">
          La IA está procesando: esperá a que termine para decidir.
        </p>
      )}
      {error && <AvisoError error={error} />}
      {confirmando ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-sm text-peligro">¿Desestimarlo? La reputación del vecino va a bajar.</p>
          <button
            type="button"
            disabled={enviando !== null}
            onClick={() => setConfirmando(false)}
            className={botonSecundario}
          >
            Cancelar
          </button>
          <button
            ref={botonConfirmar}
            type="button"
            disabled={deshabilitado}
            onClick={() => alDecidir('DESESTIMADO', comentario)}
            className="rounded-md bg-peligro px-3 py-2 text-sm font-semibold text-sobre-peligro hover:opacity-90 disabled:opacity-50"
          >
            {enviando === 'DESESTIMADO' ? 'Desestimando…' : 'Sí, desestimar'}
          </button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            ref={botonAbrir}
            type="button"
            disabled={deshabilitado}
            onClick={() => setConfirmando(true)}
            className={botonPeligro}
          >
            Desestimar
          </button>
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => alDecidir('VERIFICADO', comentario)}
            className={botonPrimario}
          >
            {enviando === 'VERIFICADO' ? 'Publicando…' : marcado ? 'Publicar igual' : 'Publicar'}
          </button>
        </div>
      )}
    </div>
  );
}
