import { Link, useParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useFicha } from '../mapa/consultas.js';
import { ConfirmarSigue } from './ConfirmarSigue.js';
import {
  AntesYDespues,
  CabeceraProblema,
  PanelUbicacion,
  RecorridoDelEstado,
  ReportesDelProblema,
} from './FichaProblema.js';
import { SeccionComentarios } from './Interacciones.js';
import { Carrusel } from './piezas.js';

/**
 * La ficha del problema (el incidente): sus fotos, en qué está su atención, la lista de los reportes de los
 * vecinos y los comentarios sobre el problema en general (#151). Acá el vecino confirma que sigue (F12). Se llega
 * desde el mapa, los avisos y las publicaciones de un problema que reportaron varios. El me gusta y los
 * comentarios de cada foto van en su publicación.
 */
export function PaginaIncidente() {
  const id = Number(useParams().id);
  const ficha = useFicha(id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link to="/" className="self-start text-sm text-texto-secundario hover:text-texto">
        ← Volver al inicio
      </Link>

      {ficha.isPending && <Cargando filas={6} />}
      {ficha.isError && (
        <AvisoError
          error={aErrorApi(ficha.error)}
          alReintentar={() => void ficha.refetch()}
          reintentando={ficha.isFetching}
        />
      )}

      {ficha.data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-6">
            <article className="tarjeta overflow-hidden">
              {ficha.data.fotoCierre ? (
                <AntesYDespues
                  fotos={ficha.data.fotos}
                  despues={ficha.data.fotoCierre}
                  descripcion={ficha.data.categoria.nombre}
                  resueltoEn={ficha.data.resueltoEn}
                />
              ) : (
                <Carrusel fotos={ficha.data.fotos} descripcion={ficha.data.categoria.nombre} />
              )}
              <div className="flex flex-col gap-4 p-4">
                <CabeceraProblema ficha={ficha.data} />
                <ConfirmarSigue ficha={ficha.data} />
              </div>
            </article>

            <RecorridoDelEstado ficha={ficha.data} />
            {ficha.data.cantidadVecinos > 1 && <ReportesDelProblema id={ficha.data.id} />}

            <div className="tarjeta p-4">
              <SeccionComentarios sobre={{ tipo: 'incidente', id: ficha.data.id }} />
            </div>
          </div>

          <PanelUbicacion ficha={ficha.data} />
        </div>
      )}
    </div>
  );
}
