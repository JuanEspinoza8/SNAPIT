import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { useFocoConfirmacion } from '../../compartido/componentes/useFocoConfirmacion.js';
import { formatearFecha } from '../../compartido/formato/fechas.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { EtiquetaReporte } from './EtiquetaReporte.js';
import { caducoEl, estadoParaElVecino, estaPublicado, tieneFicha } from './tipos.js';
import type { ReporteMio } from './tipos.js';
import { useEliminarReporte } from './useMisReportes.js';

const fecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: 'America/Argentina/Buenos_Aires',
});

interface Props {
  reporte: ReporteMio;
  /** Abre la ficha del incidente (solo se usa si el reporte la tiene). */
  alAbrirFicha: (id: number) => void;
}

/**
 * Un reporte del vecino en su perfil: foto, categoría, fecha y estado (o cuándo caducó). Si está publicado, toda
 * la fila lleva a su publicación, donde están el agradecimiento de SnapIt y los comentarios a su foto. Si no, pero
 * el problema tiene ficha, la abre al lado. Debajo, «Eliminar», con confirmación (#151).
 */
export function FilaReporte({ reporte, alAbrirFicha }: Props) {
  const incidenteId = reporte.incidente?.id;
  const publicado = estaPublicado(reporte);
  // Un problema caducado ya no está en el mapa: no se dice en qué estado quedó, sino desde cuándo no sigue.
  const caducado = caducoEl(reporte);

  const contenido = (
    <>
      <Miniatura fotoId={reporte.fotos[0]?.id} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold text-texto">{reporte.categoria.nombre}</span>
        <span className="text-sm text-texto-secundario">{fecha.format(new Date(reporte.registradoEn))}</span>
        <span className="mt-1">
          {caducado ? (
            <span className="rounded-md border border-borde px-2 py-0.5 text-xs font-semibold text-texto-secundario">
              Caducó el {formatearFecha(caducado)}
            </span>
          ) : (
            <EtiquetaReporte estado={estadoParaElVecino(reporte)} />
          )}
        </span>
      </span>
      {tieneFicha(reporte) && (
        <span aria-hidden="true" className="text-texto-secundario">
          ›
        </span>
      )}
    </>
  );

  const clases = 'flex w-full items-center gap-3 rounded-lg border border-borde bg-superficie p-3 text-left';

  return (
    <li className="flex flex-col gap-1">
      {publicado ? (
        <Link to={`/reporte/${reporte.id}`} className={`${clases} hover:bg-superficie-alterna`}>
          {contenido}
        </Link>
      ) : tieneFicha(reporte) && incidenteId !== undefined ? (
        <button
          type="button"
          onClick={() => alAbrirFicha(incidenteId)}
          className={`${clases} hover:bg-superficie-alterna`}
        >
          {contenido}
        </button>
      ) : (
        <div className={clases}>{contenido}</div>
      )}
      <EliminarReporte reporte={reporte} />
    </li>
  );
}

/**
 * «Eliminar» con su confirmación. Si el servidor no deja (por ejemplo, es el único reporte de su problema:
 * 409 UNICO_REPORTE), se muestra su explicación y el reporte queda.
 */
function EliminarReporte({ reporte }: { reporte: ReporteMio }) {
  const eliminar = useEliminarReporte();
  const [confirmando, setConfirmando] = useState(false);
  const { botonAbrir, botonConfirmar } = useFocoConfirmacion(confirmando);
  const nombre = `tu reporte de ${reporte.categoria.nombre}`;

  return (
    <div className="flex flex-col items-end gap-1">
      {confirmando ? (
        <div
          role="alertdialog"
          aria-label={`Eliminar ${nombre}`}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm">¿Eliminar {nombre}? No se puede deshacer.</span>
          <button
            ref={botonConfirmar}
            type="button"
            onClick={() => eliminar.mutate(reporte.id, { onSettled: () => setConfirmando(false) })}
            disabled={eliminar.isPending}
            className="rounded-md bg-peligro px-3 py-1 text-xs font-semibold text-sobre-peligro disabled:opacity-50"
          >
            Sí, eliminar
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-texto-secundario hover:bg-superficie-alterna"
          >
            No
          </button>
        </div>
      ) : (
        <button
          ref={botonAbrir}
          type="button"
          aria-label={`Eliminar ${nombre}`}
          onClick={() => {
            eliminar.reset();
            setConfirmando(true);
          }}
          className="rounded-md px-2 py-1 text-xs font-semibold text-peligro hover:bg-superficie-alterna"
        >
          Eliminar
        </button>
      )}
      {eliminar.isError && (
        <p role="alert" className="text-sm text-peligro">
          {aErrorApi(eliminar.error).mensaje}
        </p>
      )}
    </div>
  );
}

/**
 * Miniatura de la foto del reporte. Se pide con la sesión: así el vecino ve también la de un reporte
 * desestimado o la de un incidente que ya no está en el mapa. Si falta o no carga, queda un recuadro.
 */
function Miniatura({ fotoId }: { fotoId: number | undefined }) {
  const noDisponible = (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-borde bg-superficie-alterna text-center text-xs leading-tight text-texto-secundario">
      Foto no disponible
    </span>
  );

  if (fotoId === undefined) return noDisponible;
  return (
    <FotoConSesion
      fotoId={fotoId}
      className="h-16 w-16 shrink-0 rounded-md border border-borde object-cover"
      siFalla={noDisponible}
    />
  );
}
