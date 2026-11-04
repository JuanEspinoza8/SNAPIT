import { Link, useParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { haceCuanto } from '../../compartido/formato/fechas.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useComentariosDeReporte, useReporte } from './consultas.js';
import { Avatar, Carrusel, Contadores, SeccionComentarios } from './piezas.js';

/** La foto de un vecino dentro de un incidente: quién la subió, qué dijo, sus me gusta y sus comentarios. */
export function PaginaReporte() {
  const id = Number(useParams().id);
  const reporte = useReporte(id);
  const comentarios = useComentariosDeReporte(id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {reporte.data && (
        <Link
          to={`/incidente/${reporte.data.incidenteId}`}
          className="self-start text-sm text-texto-secundario hover:text-texto"
        >
          ← Volver al incidente
        </Link>
      )}

      {reporte.isPending && <Cargando filas={6} />}
      {reporte.isError && (
        <AvisoError
          error={aErrorApi(reporte.error)}
          alReintentar={() => void reporte.refetch()}
          reintentando={reporte.isFetching}
        />
      )}

      {reporte.data && (
        <article className="overflow-hidden rounded-lg border border-borde bg-superficie-alterna">
          <header className="flex items-center gap-3 p-4">
            <Avatar autor={reporte.data.autor} />
            <div>
              <h1 className="font-semibold">Reporte del {reporte.data.autor.nombre}</h1>
              <p className="text-sm text-texto-secundario">{haceCuanto(reporte.data.creadoEn)}</p>
            </div>
          </header>
          <Carrusel fotos={reporte.data.fotos} descripcion={`el reporte del ${reporte.data.autor.nombre}`} />
          <div className="flex flex-col gap-4 p-4">
            <Contadores
              meGusta={reporte.data.cantidadMeGusta}
              comentarios={reporte.data.cantidadComentarios}
            />
            {reporte.data.descripcion?.trim() && <p>{reporte.data.descripcion}</p>}
            <hr className="border-borde" />
            <SeccionComentarios
              titulo="Comentarios"
              comentarios={comentarios.data}
              cargando={comentarios.isPending}
              error={comentarios.isError ? aErrorApi(comentarios.error) : null}
              alReintentar={() => void comentarios.refetch()}
            />
          </div>
        </article>
      )}
    </div>
  );
}
