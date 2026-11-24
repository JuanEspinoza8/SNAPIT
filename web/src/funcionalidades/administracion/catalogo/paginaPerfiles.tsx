import { useState } from 'react';
import type { FormEvent } from 'react';
import { AvisoError } from '../../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../../compartido/componentes/Cargando.js';
import { Modal } from '../../../compartido/componentes/Modal.js';
import { aErrorApi } from '../../../compartido/red/error.js';
import { ConfirmarBaja, ENLACE, FormularioNombre, MarcaBaja } from '../piezasAdmin.js';
import type { PerfilAdmin } from './tipos.js';
import { useParametrosAdmin, usePerfilesAdmin } from './useCatalogoAdmin.js';
import { NOMBRE_REGLA, problemaFactor } from './validaciones.js';

/**
 * Los perfiles de movilidad (F16) con sus reglas de tramo: cuánto le cuesta a cada uno una escalera, un tramo sin
 * rampa, etc. Un perfil nuevo arranca con todo en 1 (sin efecto) para ajustarlo acá y en la Matriz.
 */
export function PaginaPerfiles() {
  const { perfiles, guardar, darDeBaja } = usePerfilesAdmin();
  const [editando, setEditando] = useState<PerfilAdmin | 'nuevo' | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function abrir(perfil: PerfilAdmin | 'nuevo') {
    guardar.reset();
    setAviso(null);
    setEditando(perfil);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Perfiles de movilidad</h1>
          <p className="text-texto-secundario">
            Para quién se calcula el recorrido accesible, y cuánto le cuesta pasar por cada tipo de tramo: un
            número que multiplica el costo (1 no lo cambia) o «intransitable» para que el recorrido lo evite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => abrir('nuevo')}
          className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
        >
          Nuevo perfil
        </button>
      </div>

      {aviso && (
        <p
          role="status"
          className="rounded-md border border-primario bg-superficie-alterna p-3 text-sm text-primario"
        >
          {aviso}
        </p>
      )}
      {!editando && guardar.isError && <AvisoError error={aErrorApi(guardar.error)} />}
      {perfiles.isError && (
        <AvisoError
          error={aErrorApi(perfiles.error)}
          alReintentar={() => void perfiles.refetch()}
          reintentando={perfiles.isFetching}
        />
      )}
      {perfiles.isPending && <Cargando filas={3} />}

      <ul className="grid gap-4 md:grid-cols-2">
        {perfiles.data?.perfiles.map((perfil) => (
          <li
            key={perfil.id}
            aria-label={perfil.nombre}
            className={`space-y-3 rounded-md border border-borde p-4 ${perfil.activo ? '' : 'bg-superficie-alterna'}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-texto">
                  {perfil.nombre} {!perfil.activo && <MarcaBaja texto="Dado de baja" />}
                </h2>
                {perfil.descripcion && <p className="text-sm text-texto-secundario">{perfil.descripcion}</p>}
              </div>
              {confirmando !== perfil.id && (
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    className={`${ENLACE} text-primario`}
                    aria-label={`Editar ${perfil.nombre}`}
                    onClick={() => abrir(perfil)}
                  >
                    Editar
                  </button>
                  {perfil.activo ? (
                    <button
                      type="button"
                      className={`${ENLACE} text-peligro`}
                      aria-label={`Dar de baja ${perfil.nombre}`}
                      onClick={() => {
                        darDeBaja.reset();
                        setConfirmando(perfil.id);
                      }}
                    >
                      Dar de baja
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${ENLACE} text-primario`}
                      aria-label={`Reactivar ${perfil.nombre}`}
                      disabled={guardar.isPending}
                      onClick={() =>
                        guardar.mutate(
                          {
                            id: perfil.id,
                            datos: { nombre: perfil.nombre, descripcion: perfil.descripcion, activo: true },
                          },
                          { onSuccess: () => setAviso(`${perfil.nombre} está activo de nuevo.`) },
                        )
                      }
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              )}
            </div>
            {confirmando === perfil.id && (
              <ConfirmarBaja
                pregunta={`¿Dar de baja ${perfil.nombre}? No se va a ofrecer en los recorridos, y quien lo tenía elegido queda sin perfil.`}
                pendiente={darDeBaja.isPending}
                error={darDeBaja.error}
                alCancelar={() => setConfirmando(null)}
                alConfirmar={() =>
                  darDeBaja.mutate(perfil.id, {
                    onSuccess: () => {
                      setConfirmando(null);
                      setAviso(`${perfil.nombre} quedó dado de baja.`);
                    },
                  })
                }
              />
            )}
            <ReglasPerfil perfil={perfil} />
          </li>
        ))}
      </ul>

      {/* Las sugerencias de los campos de las reglas: una sola lista para toda la página. */}
      <datalist id="valores-factor">
        <option value="intransitable" />
        <option value="1.0" />
      </datalist>

      {editando && (
        <Modal
          titulo={editando === 'nuevo' ? 'Nuevo perfil' : `Editar ${editando.nombre}`}
          ancho="max-w-lg"
          alCerrar={() => setEditando(null)}
        >
          <FormularioNombre
            maximo={60}
            inicial={editando === 'nuevo' ? null : editando}
            guardando={guardar.isPending}
            error={guardar.error}
            alCancelar={() => setEditando(null)}
            alGuardar={(datos, alFallar) =>
              guardar.mutate(
                { id: editando === 'nuevo' ? null : editando.id, datos },
                {
                  onSuccess: () => {
                    setEditando(null);
                    setAviso(
                      editando === 'nuevo'
                        ? `${datos.nombre} dado de alta: sus reglas y su columna de la matriz arrancan en 1.`
                        : 'Cambios guardados.',
                    );
                  },
                  onError: alFallar,
                },
              )
            }
          />
        </Modal>
      )}
    </section>
  );
}

/**
 * Las reglas de tramo del perfil, editables. Se guardan como parámetros (`PUT /api/admin/parametros`). Una regla
 * que el perfil no tiene no le cambia el costo: se muestra, pero no se edita.
 */
function ReglasPerfil({ perfil }: { perfil: PerfilAdmin }) {
  const { guardar } = useParametrosAdmin();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erroresServidor, setErroresServidor] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  const valorDe = (clave: string, original: string | null) => valores[clave] ?? original ?? '';
  const cambios = perfil.reglas.filter(
    (regla) =>
      regla.valor !== null && valores[regla.clave] !== undefined && valores[regla.clave] !== regla.valor,
  );
  const problemas = new Map(
    cambios
      .map((regla) => [regla.clave, problemaFactor(valores[regla.clave]!)] as const)
      .filter(([, problema]) => problema !== null),
  );

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (cambios.length === 0 || problemas.size > 0) return;
    setGuardado(false);
    guardar.mutate(
      cambios.map((regla) => ({ clave: regla.clave, valor: valores[regla.clave]!.trim() })),
      {
        onSuccess: () => {
          setValores({});
          setErroresServidor({});
          setGuardado(true);
        },
        onError: (fallo) =>
          setErroresServidor(Object.fromEntries(aErrorApi(fallo).detalles.map((d) => [d.campo, d.mensaje]))),
      },
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-2 border-t border-borde pt-3" noValidate>
      <h3 className="text-sm font-semibold text-texto">Cuánto le cuesta cada tramo</h3>
      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 text-sm">
        {perfil.reglas.map((regla) => {
          const id = `regla-${regla.clave}`;
          const problema = problemas.get(regla.clave) ?? erroresServidor[regla.clave];
          return (
            <div key={regla.clave} className="contents">
              <dt>
                <label htmlFor={id} className="text-texto">
                  {NOMBRE_REGLA[regla.regla] ?? regla.regla}
                </label>
                {problema && <p className="text-xs text-peligro">{problema}</p>}
              </dt>
              <dd>
                <input
                  id={id}
                  list="valores-factor"
                  value={valorDe(regla.clave, regla.valor)}
                  placeholder={regla.valor === null ? 'Sin regla' : undefined}
                  disabled={regla.valor === null}
                  aria-invalid={problema ? true : undefined}
                  onChange={(evento) => {
                    setValores((previos) => ({ ...previos, [regla.clave]: evento.target.value }));
                    setGuardado(false);
                  }}
                  className={`w-32 rounded-md border bg-superficie px-2 py-1 text-texto focus:outline-none ${
                    problema ? 'border-peligro' : 'border-borde focus:border-primario'
                  }`}
                />
              </dd>
            </div>
          );
        })}
      </dl>
      {guardar.isError && Object.keys(erroresServidor).length === 0 && (
        <AvisoError error={aErrorApi(guardar.error)} />
      )}
      <div className="flex items-center justify-end gap-3">
        {guardado && (
          <p role="status" className="text-sm text-primario">
            Reglas guardadas.
          </p>
        )}
        <button
          type="submit"
          disabled={cambios.length === 0 || problemas.size > 0 || guardar.isPending}
          className="rounded-md bg-primario px-3 py-1 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar reglas'}
        </button>
      </div>
    </form>
  );
}
