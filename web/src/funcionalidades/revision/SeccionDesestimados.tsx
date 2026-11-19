import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { botonPeligro, botonSecundario, enlace, fechaCorta, Lista, Miniatura, Vacio } from './piezas.js';
import { severidadEnTexto, type ReportePendiente } from './tipos.js';
import type { useRevision } from './useRevision.js';

interface Props {
  revision: ReturnType<typeof useRevision>;
  alRevisar: (reporte: ReportePendiente) => void;
}

/**
 * Los que la IA marcó para desestimar: no se ven en el mapa hasta que una persona decida. Se rescata uno
 * abriéndolo y publicándolo, o se desestiman todos juntos.
 */
export function SeccionDesestimados({ revision, alRevisar }: Props) {
  const { desestimados, confirmar } = revision;
  const [confirmando, setConfirmando] = useState(false);
  const cantidad = desestimados.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-texto-secundario">
          Según la IA, estas fotos no muestran un problema de la vía pública. No se ven en el mapa hasta que
          decidas: rescatá las que estén bien y desestimá el resto.
        </p>
        {cantidad > 0 && !confirmando && (
          <button type="button" onClick={() => setConfirmando(true)} className={botonPeligro}>
            Desestimar todos ({cantidad})
          </button>
        )}
      </div>

      {confirmando && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-peligro px-3 py-2">
          <p className="text-sm text-texto">
            ¿Desestimar {cantidad === 1 ? 'el reporte' : `los ${cantidad} reportes`}? La reputación de sus
            vecinos va a bajar.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={confirmar.isPending}
              className={botonSecundario}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={confirmar.isPending}
              onClick={() => confirmar.mutate(undefined, { onSuccess: () => setConfirmando(false) })}
              className="rounded-md bg-peligro px-3 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
            >
              {confirmar.isPending ? 'Desestimando…' : 'Sí, desestimar'}
            </button>
          </div>
        </div>
      )}
      {confirmar.isError && <AvisoError error={aErrorApi(confirmar.error)} />}
      {confirmar.data && confirmar.data.omitidos.length > 0 && (
        <p className="text-xs text-texto-secundario">
          {confirmar.data.omitidos.length === 1 ? 'Uno no se desestimó' : 'Algunos no se desestimaron'}: ya
          los había decidido otra persona.
        </p>
      )}

      {desestimados.isPending && <Cargando />}
      {desestimados.isError && (
        <AvisoError error={aErrorApi(desestimados.error)} alReintentar={() => void desestimados.refetch()} />
      )}
      {desestimados.data && cantidad === 0 && <Vacio>No hay reportes apartados por la IA.</Vacio>}

      <Lista>
        {desestimados.data?.map((reporte) => (
          <li key={reporte.id} className="flex items-center gap-3 py-3">
            <Miniatura fotoId={reporte.fotos[0]?.id} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-sm font-semibold text-texto">
                {reporte.categoria.nombre} · {severidadEnTexto[reporte.severidadDeclarada]}
              </p>
              <p className="truncate text-xs text-texto-secundario">
                #{reporte.id} · {reporte.direccion ?? 'Dirección pendiente'} ·{' '}
                {fechaCorta(reporte.registradoEn)}
              </p>
              {reporte.propuestaIa?.explicacion && (
                <p className="truncate text-xs text-texto" title={reporte.propuestaIa.explicacion}>
                  IA: {reporte.propuestaIa.explicacion}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => alRevisar(reporte)}
              className={enlace}
              aria-label={`Revisar el reporte #${reporte.id}`}
            >
              Revisar
            </button>
          </li>
        ))}
      </Lista>
    </div>
  );
}
