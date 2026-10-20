import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { TarjetaPendiente } from './TarjetaPendiente.js';
import { useRevision } from './useRevision.js';
import type { DecisionRevision } from './tipos.js';

/** La revisión del operador (F04): los reportes de baja confianza de su organismo. */
export function PaginaRevision() {
  const { pendientes, revisar } = useRevision();
  const [abierta, setAbierta] = useState<number | null>(null);

  const decidir = (id: number) => (decision: DecisionRevision, comentario: string) => {
    revisar.mutate(
      { id, decision, comentario },
      {
        onSuccess: () => {
          // Se cierra la tarjeta: el reporte ya no está en la lista.
          setAbierta(null);
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-texto">Revisión de reportes</h1>
      <p className="text-sm text-texto-secundario">
        Reportes de baja confianza de tu organismo, del más viejo al más nuevo. Revisá la foto, el nivel y las
        señales antes de decidir.
      </p>

      {pendientes.isPending && <Cargando />}

      {pendientes.isError && (
        <AvisoError
          error={aErrorApi(pendientes.error)}
          alReintentar={() => void pendientes.refetch()}
          reintentando={pendientes.isFetching}
        />
      )}

      {pendientes.data && pendientes.data.length === 0 && <SinPendientes />}

      {pendientes.data && pendientes.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {pendientes.data.map((reporte) => (
            <TarjetaPendiente
              key={reporte.id}
              reporte={reporte}
              abierta={abierta === reporte.id}
              alAbrir={() => {
                revisar.reset();
                setAbierta(abierta === reporte.id ? null : reporte.id);
              }}
              enRevision={revisar.isPending && revisar.variables?.id === reporte.id}
              error={
                revisar.isError && revisar.variables?.id === reporte.id ? aErrorApi(revisar.error) : null
              }
              alRevisar={decidir(reporte.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Lo que ve el operador cuando no queda ningún reporte por revisar. */
function SinPendientes() {
  return (
    <div className="rounded-lg border border-borde bg-superficie p-6 text-center">
      <p className="font-semibold text-texto">No hay reportes para revisar</p>
      <p className="mt-1 text-sm text-texto-secundario">
        Cuando un reporte quede con baja confianza, va a aparecer acá.
      </p>
    </div>
  );
}
