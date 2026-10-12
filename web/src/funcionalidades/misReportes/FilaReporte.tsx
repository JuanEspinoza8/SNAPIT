import { useState } from 'react';
import { EtiquetaReporte } from './EtiquetaReporte.js';
import { estadoParaElVecino, tieneFicha } from './tipos.js';
import type { ReporteMio } from './tipos.js';

const fecha = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: 'America/Argentina/Buenos_Aires',
});

interface Props {
  reporte: ReporteMio;
  /** Abre la ficha del incidente (solo se usa si el reporte la tiene). */
  alAbrirFicha: (id: number) => void;
}

/** Una fila de «Mis reportes»: foto, categoría, fecha y estado. Si hay ficha, toda la fila la abre. */
export function FilaReporte({ reporte, alAbrirFicha }: Props) {
  const incidenteId = reporte.incidente?.id;

  const contenido = (
    <>
      <Miniatura url={reporte.fotos[0]?.url} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold text-texto">{reporte.categoria.nombre}</span>
        <span className="text-sm text-texto-secundario">{fecha.format(new Date(reporte.registradoEn))}</span>
        <span className="mt-1">
          <EtiquetaReporte estado={estadoParaElVecino(reporte)} />
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
    <li>
      {tieneFicha(reporte) && incidenteId !== undefined ? (
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
    </li>
  );
}

/** Miniatura de la foto del reporte. Si falta o no carga (un desestimado da 404), queda un recuadro. */
function Miniatura({ url }: { url: string | undefined }) {
  const [fallo, setFallo] = useState(false);

  if (!url || fallo) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-borde bg-superficie-alterna text-center text-xs leading-tight text-texto-secundario">
        Foto no disponible
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFallo(true)}
      className="h-16 w-16 shrink-0 rounded-md border border-borde object-cover"
    />
  );
}
