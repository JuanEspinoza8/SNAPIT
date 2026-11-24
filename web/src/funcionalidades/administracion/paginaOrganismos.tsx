import { useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { Cargando } from '../../compartido/componentes/Cargando.js';
import { Modal } from '../../compartido/componentes/Modal.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { ConfirmarBaja, ENLACE, FormularioNombre, MarcaBaja, normalizar } from './piezasAdmin.js';
import type { AreaAdmin, OrganismoAdmin } from './tipos.js';
import { useOrganismos } from './useOrganismos.js';

/** Qué se está cargando en la ventana: un organismo (nuevo o existente) o un área de un organismo. */
type Formulario =
  | { tipo: 'organismo'; organismo: OrganismoAdmin | null }
  | { tipo: 'area'; organismo: OrganismoAdmin; area: AreaAdmin | null };

const lista = (filas: { nombre: string }[]) => filas.map((fila) => fila.nombre).join(', ');

/**
 * Organismos y áreas (F16): las listas con búsqueda, el alta, la edición y la baja. Nada se borra: lo dado de
 * baja queda en la lista, marcado, y se puede reactivar. Lo que no se puede dar de baja lo dice al lado del botón.
 */
export function PaginaOrganismos() {
  const { organismos, guardarOrganismo, darDeBajaOrganismo, guardarArea, darDeBajaArea } = useOrganismos();
  const [busqueda, setBusqueda] = useState('');
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  // La baja que se está confirmando: `organismo-3` o `area-7`.
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const todos = organismos.data?.organismos ?? [];
  const texto = normalizar(busqueda);
  const visibles = texto
    ? todos.filter(
        (organismo) =>
          normalizar(organismo.nombre).includes(texto) ||
          organismo.areas.some((area) => normalizar(area.nombre).includes(texto)),
      )
    : todos;

  function abrir(nuevo: Formulario) {
    guardarOrganismo.reset();
    guardarArea.reset();
    setAviso(null);
    setFormulario(nuevo);
  }

  function pedirBaja(clave: string) {
    darDeBajaOrganismo.reset();
    darDeBajaArea.reset();
    setAviso(null);
    setConfirmando(clave);
  }

  function reactivarOrganismo(organismo: OrganismoAdmin) {
    setAviso(null);
    guardarOrganismo.mutate(
      {
        id: organismo.id,
        datos: { nombre: organismo.nombre, descripcion: organismo.descripcion, activo: true },
      },
      { onSuccess: () => setAviso(`${organismo.nombre} está activo de nuevo.`) },
    );
  }

  function reactivarArea(organismo: OrganismoAdmin, area: AreaAdmin) {
    setAviso(null);
    guardarArea.mutate(
      {
        id: area.id,
        organismoId: organismo.id,
        datos: { nombre: area.nombre, descripcion: area.descripcion, activa: true },
      },
      { onSuccess: () => setAviso(`${area.nombre} está activa de nuevo.`) },
    );
  }

  // El error de reactivar no tiene ventana ni confirmación propia: va arriba de la lista.
  const errorSuelto = !formulario && (guardarOrganismo.error ?? guardarArea.error);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Organismos y áreas</h1>
        <p className="text-texto-secundario">
          Los organismos y sus áreas, a las que se derivan los incidentes. Lo dado de baja no se borra: queda
          marcado en la lista, sus incidentes siguen como estaban y se puede reactivar.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Campo
            id="busqueda"
            etiqueta="Buscar"
            type="search"
            placeholder="Organismo o área"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => abrir({ tipo: 'organismo', organismo: null })}
          className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
        >
          Nuevo organismo
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
      {errorSuelto && <AvisoError error={aErrorApi(errorSuelto)} />}

      {organismos.isError && (
        <AvisoError
          error={aErrorApi(organismos.error)}
          alReintentar={() => void organismos.refetch()}
          reintentando={organismos.isFetching}
        />
      )}
      {organismos.isPending && <Cargando filas={3} />}
      {organismos.data && visibles.length === 0 && (
        <p className="text-texto-secundario">
          {texto ? 'Ningún organismo ni área coincide con la búsqueda.' : 'Todavía no hay organismos.'}
        </p>
      )}

      <ul className="space-y-4">
        {visibles.map((organismo) => {
          const areasActivas = organismo.areas.filter((area) => area.activa);
          const clave = `organismo-${organismo.id}`;
          return (
            <li
              key={organismo.id}
              aria-label={organismo.nombre}
              className={`tarjeta ${organismo.activo ? '' : 'text-texto-secundario'}`}
            >
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-texto">
                      {organismo.nombre} {!organismo.activo && <MarcaBaja texto="Dado de baja" />}
                    </h2>
                    {organismo.descripcion && (
                      <p className="text-sm text-texto-secundario">{organismo.descripcion}</p>
                    )}
                  </div>
                  {confirmando !== clave && (
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        className={`${ENLACE} text-primario`}
                        aria-label={`Editar ${organismo.nombre}`}
                        onClick={() => abrir({ tipo: 'organismo', organismo })}
                      >
                        Editar
                      </button>
                      {organismo.activo ? (
                        <BotonBaja
                          nombre={organismo.nombre}
                          // Con áreas activas no se puede: se explica abajo.
                          deshabilitado={areasActivas.length > 0}
                          alPedir={() => pedirBaja(clave)}
                        />
                      ) : (
                        <button
                          type="button"
                          className={`${ENLACE} text-primario`}
                          aria-label={`Reactivar ${organismo.nombre}`}
                          disabled={guardarOrganismo.isPending}
                          onClick={() => reactivarOrganismo(organismo)}
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {organismo.activo && areasActivas.length > 0 && (
                  <p className="text-xs text-texto-secundario">
                    Para darlo de baja, primero hay que dar de baja sus áreas activas ({lista(areasActivas)}):
                    si no, seguirían recibiendo trabajo de un organismo que ya no opera.
                  </p>
                )}
                {confirmando === clave && (
                  <ConfirmarBaja
                    pregunta={`¿Dar de baja ${organismo.nombre}? No se va a poder elegir para nuevos operadores ni áreas.`}
                    pendiente={darDeBajaOrganismo.isPending}
                    error={darDeBajaOrganismo.error}
                    alCancelar={() => setConfirmando(null)}
                    alConfirmar={() =>
                      darDeBajaOrganismo.mutate(organismo.id, {
                        onSuccess: () => {
                          setConfirmando(null);
                          setAviso(`${organismo.nombre} quedó dado de baja.`);
                        },
                      })
                    }
                  />
                )}
              </div>

              <div className="border-t border-borde p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-texto">Áreas</h3>
                  {organismo.activo && (
                    <button
                      type="button"
                      className={`${ENLACE} text-primario`}
                      aria-label={`Nueva área en ${organismo.nombre}`}
                      onClick={() => abrir({ tipo: 'area', organismo, area: null })}
                    >
                      Nueva área
                    </button>
                  )}
                </div>
                {organismo.areas.length === 0 ? (
                  <p className="text-sm text-texto-secundario">Sin áreas.</p>
                ) : (
                  <ul className="lista-filas">
                    {organismo.areas.map((area) => (
                      <FilaArea
                        key={area.id}
                        organismo={organismo}
                        area={area}
                        confirmando={confirmando === `area-${area.id}`}
                        reactivando={guardarArea.isPending}
                        bajando={darDeBajaArea}
                        alEditar={() => abrir({ tipo: 'area', organismo, area })}
                        alPedirBaja={() => pedirBaja(`area-${area.id}`)}
                        alCancelar={() => setConfirmando(null)}
                        alConfirmar={() =>
                          darDeBajaArea.mutate(area.id, {
                            onSuccess: () => {
                              setConfirmando(null);
                              setAviso(`${area.nombre} quedó dada de baja.`);
                            },
                          })
                        }
                        alReactivar={() => reactivarArea(organismo, area)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {formulario?.tipo === 'organismo' && (
        <Modal
          titulo={formulario.organismo ? `Editar ${formulario.organismo.nombre}` : 'Nuevo organismo'}
          ancho="max-w-lg"
          alCerrar={() => setFormulario(null)}
        >
          <FormularioNombre
            maximo={150}
            inicial={formulario.organismo}
            guardando={guardarOrganismo.isPending}
            error={guardarOrganismo.error}
            alCancelar={() => setFormulario(null)}
            alGuardar={(datos, alFallar) =>
              guardarOrganismo.mutate(
                { id: formulario.organismo?.id ?? null, datos },
                {
                  onSuccess: () => {
                    setFormulario(null);
                    setAviso(formulario.organismo ? 'Cambios guardados.' : `${datos.nombre} dado de alta.`);
                  },
                  onError: alFallar,
                },
              )
            }
          />
        </Modal>
      )}
      {formulario?.tipo === 'area' && (
        <Modal
          titulo={
            formulario.area
              ? `Editar ${formulario.area.nombre}`
              : `Nueva área en ${formulario.organismo.nombre}`
          }
          ancho="max-w-lg"
          alCerrar={() => setFormulario(null)}
        >
          <FormularioNombre
            maximo={120}
            inicial={formulario.area}
            guardando={guardarArea.isPending}
            error={guardarArea.error}
            alCancelar={() => setFormulario(null)}
            alGuardar={(datos, alFallar) =>
              guardarArea.mutate(
                { id: formulario.area?.id ?? null, organismoId: formulario.organismo.id, datos },
                {
                  onSuccess: () => {
                    setFormulario(null);
                    setAviso(formulario.area ? 'Cambios guardados.' : `${datos.nombre} dada de alta.`);
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

function FilaArea({
  organismo,
  area,
  confirmando,
  reactivando,
  bajando,
  alEditar,
  alPedirBaja,
  alCancelar,
  alConfirmar,
  alReactivar,
}: {
  organismo: OrganismoAdmin;
  area: AreaAdmin;
  confirmando: boolean;
  reactivando: boolean;
  bajando: ReturnType<typeof useOrganismos>['darDeBajaArea'];
  alEditar: () => void;
  alPedirBaja: () => void;
  alCancelar: () => void;
  alConfirmar: () => void;
  alReactivar: () => void;
}) {
  const conCategorias = area.activa && area.categoriasActivas > 0;
  return (
    <li aria-label={area.nombre} className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className={`min-w-0 ${area.activa ? '' : 'text-texto-secundario'}`}>
          <p className="font-semibold">
            {area.nombre} {!area.activa && <MarcaBaja texto="Dada de baja" />}
          </p>
          {area.descripcion && <p className="text-texto-secundario">{area.descripcion}</p>}
        </div>
        {!confirmando && (
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              className={`${ENLACE} text-primario`}
              aria-label={`Editar ${area.nombre}`}
              onClick={alEditar}
            >
              Editar
            </button>
            {area.activa ? (
              <BotonBaja nombre={area.nombre} deshabilitado={conCategorias} alPedir={alPedirBaja} />
            ) : (
              organismo.activo && (
                <button
                  type="button"
                  className={`${ENLACE} text-primario`}
                  aria-label={`Reactivar ${area.nombre}`}
                  disabled={reactivando}
                  onClick={alReactivar}
                >
                  Reactivar
                </button>
              )
            )}
          </div>
        )}
      </div>
      {conCategorias && (
        <p className="text-xs text-texto-secundario">
          Tiene{' '}
          {area.categoriasActivas === 1
            ? 'una categoría activa'
            : `${area.categoriasActivas} categorías activas`}
          : para darla de baja, primero hay que pasarlas a otra área o darlas de baja, porque sus reportes
          seguirían llegando acá.
        </p>
      )}
      {!area.activa && !organismo.activo && (
        <p className="text-xs text-texto-secundario">
          Para reactivarla, primero hay que reactivar el organismo.
        </p>
      )}
      {confirmando && (
        <ConfirmarBaja
          pregunta={`¿Dar de baja ${area.nombre}? No va a recibir derivaciones; sus incidentes quedan como están.`}
          pendiente={bajando.isPending}
          error={bajando.error}
          alCancelar={alCancelar}
          alConfirmar={alConfirmar}
        />
      )}
    </li>
  );
}

function BotonBaja({
  nombre,
  deshabilitado,
  alPedir,
}: {
  nombre: string;
  deshabilitado: boolean;
  alPedir: () => void;
}) {
  return (
    <button
      type="button"
      className={`${ENLACE} text-peligro`}
      aria-label={`Dar de baja ${nombre}`}
      disabled={deshabilitado}
      onClick={alPedir}
    >
      Dar de baja
    </button>
  );
}
