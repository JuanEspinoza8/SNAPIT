import { useState } from 'react';
import type { FormEvent } from 'react';
import { AvisoError } from '../../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../../compartido/red/error.js';
import type { Parametro } from './tipos.js';
import { useParametrosAdmin } from './useCatalogoAdmin.js';
import { agruparParametros, type GrupoParametros, problemaParametro } from './validaciones.js';

const TEXTO_TIPO: Record<string, string> = {
  entero: 'Número entero',
  decimal: 'Número (con punto para los decimales)',
  factor: 'Un número mayor que 0 o «intransitable»',
};

/**
 * Los parámetros de los cálculos (F16), agrupados por cálculo y cada uno con para qué sirve. Cada grupo se guarda
 * aparte, todo junto: el servidor guarda todos o ninguno. El cambio se usa en el próximo cálculo.
 */
export function PaginaParametros() {
  const { parametros } = useParametrosAdmin();
  const grupos = agruparParametros(parametros.data?.parametros ?? []);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Parámetros</h1>
        <p className="text-texto-secundario">
          Los valores con los que el sistema verifica, agrupa, prioriza y calcula recorridos. Un cambio se usa
          en el próximo cálculo, sin reiniciar nada; lo ya calculado no cambia hasta que se recalcule.
        </p>
      </div>
      {parametros.isError && (
        <AvisoError
          error={aErrorApi(parametros.error)}
          alReintentar={() => void parametros.refetch()}
          reintentando={parametros.isFetching}
        />
      )}
      {parametros.isPending && <Cargando filas={6} />}
      {grupos.map((grupo) => (
        <GrupoEditable key={grupo.prefijo} grupo={grupo} />
      ))}
    </section>
  );
}

function GrupoEditable({ grupo }: { grupo: GrupoParametros<Parametro> }) {
  const { guardar } = useParametrosAdmin();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erroresServidor, setErroresServidor] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  const cambios = grupo.parametros.filter(
    (parametro) =>
      valores[parametro.clave] !== undefined && valores[parametro.clave]!.trim() !== parametro.valor,
  );
  const problemas = new Map(
    cambios
      .map(
        (parametro) =>
          [parametro.clave, problemaParametro(parametro.tipo, valores[parametro.clave]!)] as const,
      )
      .filter(([, problema]) => problema !== null),
  );

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (cambios.length === 0 || problemas.size > 0) return;
    setGuardado(false);
    guardar.mutate(
      cambios.map((parametro) => ({ clave: parametro.clave, valor: valores[parametro.clave]!.trim() })),
      {
        onSuccess: () => {
          setValores({});
          setErroresServidor({});
          setGuardado(true);
        },
        // El servidor aplica además la regla de cada clave: su mensaje va en el campo.
        onError: (fallo) =>
          setErroresServidor(Object.fromEntries(aErrorApi(fallo).detalles.map((d) => [d.campo, d.mensaje]))),
      },
    );
  }

  const tituloId = `grupo-${grupo.prefijo}`;
  return (
    <form
      onSubmit={enviar}
      aria-labelledby={tituloId}
      className="space-y-3 rounded-md border border-borde p-4"
      noValidate
    >
      <div>
        <h2 id={tituloId} className="text-lg font-semibold text-texto">
          {grupo.nombre}
        </h2>
        {grupo.explica && <p className="text-sm text-texto-secundario">{grupo.explica}</p>}
      </div>
      <ul className="divide-y divide-borde">
        {grupo.parametros.map((parametro) => {
          const id = `parametro-${parametro.clave}`;
          const ayuda = `${id}-ayuda`;
          const problema = problemas.get(parametro.clave) ?? erroresServidor[parametro.clave];
          return (
            <li
              key={parametro.clave}
              className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_10rem] sm:items-start"
            >
              <div className="min-w-0">
                <label htmlFor={id} className="font-mono text-xs font-semibold break-all text-texto">
                  {parametro.clave}
                </label>
                <p id={ayuda} className="text-texto-secundario">
                  {parametro.descripcion ?? 'Sin descripción.'}
                </p>
              </div>
              <div>
                <input
                  id={id}
                  inputMode={parametro.tipo === 'entero' ? 'numeric' : 'decimal'}
                  value={valores[parametro.clave] ?? parametro.valor}
                  aria-describedby={ayuda}
                  aria-invalid={problema ? true : undefined}
                  title={TEXTO_TIPO[parametro.tipo]}
                  onChange={(evento) => {
                    setValores((previos) => ({ ...previos, [parametro.clave]: evento.target.value }));
                    setErroresServidor(({ [parametro.clave]: _quitado, ...resto }) => resto);
                    setGuardado(false);
                  }}
                  className={`w-full rounded-md border bg-superficie px-2 py-1 text-texto focus:outline-none ${
                    problema ? 'border-peligro' : 'border-borde focus:border-primario'
                  }`}
                />
                {problema && <p className="text-xs text-peligro">{problema}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {guardar.isError && Object.keys(erroresServidor).length === 0 && (
        <AvisoError error={aErrorApi(guardar.error)} />
      )}
      <div className="flex items-center justify-end gap-3">
        {guardado && (
          <p role="status" className="text-sm text-primario">
            Guardado. Se usa desde el próximo cálculo.
          </p>
        )}
        <button
          type="submit"
          disabled={cambios.length === 0 || problemas.size > 0 || guardar.isPending}
          className="rounded-md bg-primario px-3 py-1 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando…' : `Guardar ${grupo.nombre.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
