import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { aErrorApi, ErrorApi } from '../../compartido/red/error.js';
import { severidadEnTexto } from '../revision/tipos.js';
import { accionesValidas, motivoSinGestion } from './acciones.js';
import {
  BotonAccion,
  DialogoCategoria,
  DialogoDerivar,
  DialogoEstado,
  DialogoPrioridad,
} from './AccionesFicha.js';
import { Bitacora } from './Bitacora.js';
import { DesglosePrioridad } from './DesglosePrioridad.js';
import { ESTADOS_INCIDENTE, EtiquetaEstadoIncidente } from './EtiquetaEstadoIncidente.js';
import { fechaHora } from './formato.js';
import { ReportesFicha } from './ReportesFicha.js';
import type { FichaGestion } from './tipos.js';
import { useAccionesFicha, useAreas, useFicha } from './useGestion.js';

type Dialogo = 'derivar' | 'ejecucion' | 'desestimar' | 'categoria' | 'prioridad' | null;

/** F06, F07 y F08: todo lo que el operador necesita para decidir y actuar sobre un incidente. */
export function PaginaFicha() {
  const { id: parametro } = useParams();
  const id = Number(parametro);
  // La bandeja manda en `desde` su URL con los filtros, para volver a la misma vista.
  const desde = (useLocation().state as { desde?: string } | null)?.desde ?? '/bandeja';

  return (
    <section className="flex flex-col gap-4">
      <Link to={desde} className="self-start text-sm font-semibold text-primario hover:underline">
        Volver a la bandeja
      </Link>
      {Number.isInteger(id) && id > 0 ? (
        <Ficha key={id} id={id} />
      ) : (
        <AvisoError error={new ErrorApi('El incidente no existe', 'INCIDENTE_NO_ENCONTRADO')} />
      )}
    </section>
  );
}

function Ficha({ id }: { id: number }) {
  const ficha = useFicha(id);
  if (ficha.isPending) return <Cargando filas={6} />;
  if (ficha.isError) {
    return (
      <AvisoError
        error={aErrorApi(ficha.error)}
        alReintentar={() => void ficha.refetch()}
        reintentando={ficha.isFetching}
      />
    );
  }
  return <Contenido ficha={ficha.data} />;
}

function Contenido({ ficha }: { ficha: FichaGestion }) {
  const acciones = useAccionesFicha(ficha.id);
  const { areas, categorias } = useAreas();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const validas = accionesValidas(ficha);
  const sinGestion = motivoSinGestion(ficha);

  const abrir = (cual: Exclude<Dialogo, null>) => {
    // Un error de la vez anterior no tiene que aparecer al volver a abrir.
    acciones.derivar.reset();
    acciones.cambiarEstado.reset();
    acciones.cambiarCategoria.reset();
    acciones.fijarPrioridad.reset();
    setDialogo(cual);
  };
  const cerrar = () => setDialogo(null);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-texto">
            Incidente #{ficha.id} · {ficha.categoria.nombre}
          </h1>
          <EtiquetaEstadoIncidente estado={ficha.estado} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          <Dato titulo="Área">{ficha.area.nombre}</Dato>
          <Dato titulo="Dirección">{ficha.direccion ?? 'Pendiente'}</Dato>
          <Dato titulo="Gravedad">{severidadEnTexto[ficha.severidad]}</Dato>
          <Dato titulo="Reportes">{ficha.cantidadReportes}</Dato>
          <Dato titulo="Primer reporte">{fechaHora(ficha.primerReporteEn)}</Dato>
          <Dato titulo="Vigencia">
            {ficha.tipoVigencia === 'TEMPORAL' && ficha.vigenteHasta
              ? `Temporal, hasta ${fechaHora(ficha.vigenteHasta)}`
              : ficha.tipoVigencia === 'TEMPORAL'
                ? 'Temporal'
                : 'Permanente'}
          </Dato>
          {ficha.caducadoEn && <Dato titulo="Caducó">{fechaHora(ficha.caducadoEn)}</Dato>}
          {ficha.resueltoEn && <Dato titulo="Resuelto">{fechaHora(ficha.resueltoEn)}</Dato>}
        </dl>
      </div>

      {sinGestion && (
        <p
          role="status"
          className="rounded-md border border-borde bg-superficie-alterna px-3 py-2 text-sm text-texto"
        >
          {sinGestion}{' '}
          {ficha.incidentePrincipalId !== null && (
            <Link
              to={`/bandeja/${ficha.incidentePrincipalId}`}
              className="font-semibold text-primario hover:underline"
            >
              Ir al #{ficha.incidentePrincipalId}
            </Link>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {validas.derivar && <BotonAccion alElegir={() => abrir('derivar')}>Derivar…</BotonAccion>}
        {validas.pasarAEjecucion && (
          <BotonAccion alElegir={() => abrir('ejecucion')}>Pasar a ejecución…</BotonAccion>
        )}
        {validas.cambiarCategoria && (
          <BotonAccion alElegir={() => abrir('categoria')}>Cambiar la categoría…</BotonAccion>
        )}
        {validas.desestimar && (
          <BotonAccion peligrosa alElegir={() => abrir('desestimar')}>
            Desestimar…
          </BotonAccion>
        )}
        {/* Unir y separar quedaron en su propia pestaña (#69): la ficha no los repite. */}
        <Link to="/incidentes" className="px-3 py-2 text-sm font-semibold text-primario hover:underline">
          Unir o separar en Incidentes
        </Link>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ReportesFicha incidenteId={ficha.id} reportes={ficha.reportes} />
        <div className="flex flex-col gap-4">
          <DesglosePrioridad
            prioridad={ficha.prioridad}
            puedeFijar={validas.fijarPrioridad}
            puedeQuitar={validas.quitarPrioridad}
            alFijar={() => abrir('prioridad')}
            quitar={acciones.quitarPrioridad}
          />
          {ficha.unidos.length > 0 && (
            <section className="flex flex-col gap-2 rounded-lg border border-borde p-4 text-sm">
              <h2 className="font-semibold text-texto">Unidos a este</h2>
              <ul className="flex flex-col gap-1">
                {ficha.unidos.map((unido) => (
                  <li key={unido.id}>
                    <Link to={`/bandeja/${unido.id}`} className="font-semibold text-primario hover:underline">
                      #{unido.id}
                    </Link>{' '}
                    <span className="text-texto-secundario">{ESTADOS_INCIDENTE[unido.estado].etiqueta}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Bitacora movimientos={ficha.bitacora} comentar={acciones.comentar} />
        </div>
      </div>

      {dialogo === 'derivar' && (
        <DialogoDerivar
          ficha={ficha}
          areas={areas}
          mutacion={acciones.derivar}
          alTerminar={cerrar}
          alCerrar={cerrar}
        />
      )}
      {(dialogo === 'ejecucion' || dialogo === 'desestimar') && (
        <DialogoEstado
          ficha={ficha}
          estado={dialogo === 'ejecucion' ? 'EN_EJECUCION' : 'DESESTIMADO'}
          mutacion={acciones.cambiarEstado}
          alTerminar={cerrar}
          alCerrar={cerrar}
        />
      )}
      {dialogo === 'categoria' && (
        <DialogoCategoria
          ficha={ficha}
          categorias={categorias.data ?? []}
          mutacion={acciones.cambiarCategoria}
          alTerminar={cerrar}
          alCerrar={cerrar}
        />
      )}
      {dialogo === 'prioridad' && (
        <DialogoPrioridad
          ficha={ficha}
          mutacion={acciones.fijarPrioridad}
          alTerminar={cerrar}
          alCerrar={cerrar}
        />
      )}
    </>
  );
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-texto-secundario">{titulo}</dt>
      <dd className="text-texto">{children}</dd>
    </>
  );
}
