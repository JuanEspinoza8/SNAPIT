import { useState } from 'react';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { SENALES, severidadEnTexto, type EstadoVerificacion } from '../revision/tipos.js';
import { fechaHora, numero } from './formato.js';
import type { ReporteGestion } from './tipos.js';

const VERIFICACION: Record<EstadoVerificacion, string> = {
  VERIFICADO: 'Verificado',
  PENDIENTE_REVISION: 'Pendiente de revisión',
  DESESTIMADO: 'Desestimado',
};

/** Los reportes del incidente y de sus unidos, con sus fotos, su nivel de confianza y por qué. */
export function ReportesFicha({
  incidenteId,
  reportes,
}: {
  incidenteId: number;
  reportes: ReporteGestion[];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borde p-4">
      <h2 className="font-semibold text-texto">Reportes ({reportes.length})</h2>
      <ul className="flex flex-col gap-3">
        {reportes.map((reporte) => (
          <Reporte key={reporte.id} reporte={reporte} deUnido={reporte.incidenteId !== incidenteId} />
        ))}
      </ul>
    </section>
  );
}

function Reporte({ reporte, deUnido }: { reporte: ReporteGestion; deUnido: boolean }) {
  const [fotoElegida, setFotoElegida] = useState(0);
  const foto = reporte.fotos[fotoElegida] ?? reporte.fotos[0];
  return (
    <li className="flex flex-col gap-3 rounded-md bg-superficie-alterna p-3 sm:flex-row">
      <div className="flex shrink-0 flex-col gap-2 sm:w-48">
        {/* Con la sesión del operador: también se ven las de reportes desestimados (#49). */}
        {foto ? (
          <FotoConSesion
            key={foto.id}
            fotoId={foto.id}
            className="aspect-[4/3] w-full rounded object-cover"
            siFalla={
              <span className="flex aspect-[4/3] w-full items-center justify-center rounded bg-borde text-xs text-texto-secundario">
                Foto no disponible
              </span>
            }
          />
        ) : (
          <span className="flex aspect-[4/3] w-full items-center justify-center rounded bg-borde text-xs text-texto-secundario">
            Sin foto
          </span>
        )}
        {reporte.fotos.length > 1 && (
          <div className="flex gap-1">
            {reporte.fotos.map((otra, indice) => (
              <button
                key={otra.id}
                type="button"
                onClick={() => setFotoElegida(indice)}
                aria-label={`Ver la foto ${indice + 1} del reporte #${reporte.id}`}
                className={`rounded border-2 ${indice === fotoElegida ? 'border-primario' : 'border-transparent'}`}
              >
                <FotoConSesion fotoId={otra.id} className="h-10 w-14 rounded object-cover" siFalla={null} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="font-semibold text-texto">
          Reporte #{reporte.id} · {reporte.categoria.nombre} · {severidadEnTexto[reporte.severidadDeclarada]}
        </p>
        {deUnido && (
          <p className="text-xs text-texto-secundario">Del incidente #{reporte.incidenteId}, unido a este</p>
        )}
        <p className="text-texto">
          {reporte.descripcion ?? <i className="text-texto-secundario">Sin descripción</i>}
        </p>
        <p className="text-xs text-texto-secundario">
          {fechaHora(reporte.registradoEn)} · desde{' '}
          {reporte.origen === 'APP_MOVIL' ? 'la app' : 'el sitio web'}
        </p>
        <p className="text-texto">
          Confianza <strong>{reporte.nivelConfianza}</strong>/100 · {VERIFICACION[reporte.estadoVerificacion]}
        </p>
        {reporte.senales.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-texto">
            {reporte.senales.map((senal) => (
              <li key={senal.tipo}>
                <span className="font-semibold">
                  {SENALES[senal.tipo] ?? senal.tipo} ({senal.valor > 0 ? '+' : ''}
                  {numero.format(senal.valor)})
                </span>
                {senal.detalle && `: ${senal.detalle}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
