import { useSalud } from './useSalud.js';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { aErrorApi } from '../../compartido/red/error.js';

export function PaginaSalud() {
  const { data, isPending, isError, error, refetch, isFetching } = useSalud();

  if (isPending) {
    return <p className="text-texto-secundario">Consultando el estado del servidor…</p>;
  }

  if (isError) {
    return (
      <AvisoError error={aErrorApi(error)} alReintentar={() => void refetch()} reintentando={isFetching} />
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-texto">Estado del servidor</h1>
      <dl className="grid gap-2 rounded-lg border border-borde bg-superficie p-4 text-texto">
        <div className="flex gap-2">
          <dt className="font-semibold">API</dt>
          <dd>{data.estado}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Base de datos</dt>
          <dd>{data.baseDeDatos}</dd>
        </div>
      </dl>
    </section>
  );
}
