import { useState } from 'react';
import type { FormEvent } from 'react';
import { AvisoError } from '../../../compartido/componentes/AvisoError.js';
import { Campo } from '../../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../../compartido/componentes/CampoSelecto.js';
import { Cargando } from '../../../compartido/componentes/Cargando.js';
import { Modal } from '../../../compartido/componentes/Modal.js';
import { aErrorApi } from '../../../compartido/red/error.js';
import { repartirErrores } from '../../../compartido/red/erroresPorCampo.js';
import { BOTON_SECUNDARIO, ConfirmarBaja, ENLACE, MarcaBaja, normalizar } from '../piezasAdmin.js';
import type { Organismo } from '../tipos.js';
import { useAdministracion } from '../useAdministracion.js';
import type { CategoriaAdmin, DatosCategoria, TipoVigencia } from './tipos.js';
import { useCategoriasAdmin } from './useCatalogoAdmin.js';
import { problemaDosDecimales } from './validaciones.js';

const formatoPeso = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function textoVigencia(categoria: CategoriaAdmin) {
  if (categoria.tipoVigenciaDefault === 'PERMANENTE') return 'Permanente';
  return categoria.diasCaducidadDefault
    ? `Temporal: caduca a los ${categoria.diasCaducidadDefault} días`
    : 'Temporal: caduca a los días por defecto';
}

/**
 * Las categorías de problemas (F16): las que elige el vecino al reportar, con el área que las atiende, su vigencia
 * y su peso en la prioridad. Lo dado de baja queda en la lista, marcado, y se puede reactivar.
 */
export function PaginaCategorias() {
  const { categorias, guardar, darDeBaja } = useCategoriasAdmin();
  const { organismos } = useAdministracion();
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<CategoriaAdmin | 'nueva' | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const texto = normalizar(busqueda);
  const visibles = (categorias.data?.categorias ?? []).filter(
    (categoria) =>
      !texto ||
      normalizar(categoria.nombre).includes(texto) ||
      normalizar(categoria.area.nombre).includes(texto),
  );

  function abrir(categoria: CategoriaAdmin | 'nueva') {
    guardar.reset();
    setAviso(null);
    setEditando(categoria);
  }

  function reactivar(categoria: CategoriaAdmin) {
    setAviso(null);
    guardar.mutate(
      { id: categoria.id, datos: { ...aDatos(categoria), activa: true } },
      { onSuccess: () => setAviso(`${categoria.nombre} está activa de nuevo.`) },
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Categorías</h1>
        <p className="text-texto-secundario">
          Los tipos de problema que se pueden reportar, el área que los atiende, cuánto duran y cuánto pesan
          en la prioridad.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Campo
            id="busqueda"
            etiqueta="Buscar"
            type="search"
            placeholder="Categoría o área"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => abrir('nueva')}
          className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
        >
          Nueva categoría
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
      {categorias.isError && (
        <AvisoError
          error={aErrorApi(categorias.error)}
          alReintentar={() => void categorias.refetch()}
          reintentando={categorias.isFetching}
        />
      )}
      {categorias.isPending && <Cargando filas={4} />}
      {categorias.data && visibles.length === 0 && (
        <p className="text-texto-secundario">
          {texto ? 'Ninguna categoría coincide con la búsqueda.' : 'Todavía no hay categorías.'}
        </p>
      )}

      <ul className="lista-filas">
        {visibles.map((categoria) => (
          <li
            key={categoria.id}
            aria-label={categoria.nombre}
            className={`space-y-2 p-3 text-sm ${categoria.activa ? '' : 'text-texto-secundario'}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-texto">
                  {categoria.nombre} {!categoria.activa && <MarcaBaja texto="Dada de baja" />}
                </p>
                <p className="text-texto-secundario">
                  {categoria.area.nombre}
                  {!categoria.area.activa && ' (área dada de baja)'} · {textoVigencia(categoria)} · Pesa ×
                  {formatoPeso.format(categoria.pesoSeveridadBase)}
                </p>
              </div>
              {confirmando !== categoria.id && (
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    className={`${ENLACE} text-primario`}
                    aria-label={`Editar ${categoria.nombre}`}
                    onClick={() => abrir(categoria)}
                  >
                    Editar
                  </button>
                  {categoria.activa ? (
                    <button
                      type="button"
                      className={`${ENLACE} text-peligro`}
                      aria-label={`Dar de baja ${categoria.nombre}`}
                      onClick={() => {
                        darDeBaja.reset();
                        setAviso(null);
                        setConfirmando(categoria.id);
                      }}
                    >
                      Dar de baja
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${ENLACE} text-primario`}
                      aria-label={`Reactivar ${categoria.nombre}`}
                      // Una categoría activa necesita un área que reciba sus reportes.
                      disabled={!categoria.area.activa || guardar.isPending}
                      onClick={() => reactivar(categoria)}
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              )}
            </div>
            {!categoria.activa && !categoria.area.activa && (
              <p className="text-xs text-texto-secundario">
                Para reactivarla, primero hay que pasarla a un área activa (Editar).
              </p>
            )}
            {confirmando === categoria.id && (
              <ConfirmarBaja
                pregunta={`¿Dar de baja ${categoria.nombre}? No se va a poder elegir al reportar; sus incidentes quedan como están.`}
                pendiente={darDeBaja.isPending}
                error={darDeBaja.error}
                alCancelar={() => setConfirmando(null)}
                alConfirmar={() =>
                  darDeBaja.mutate(categoria.id, {
                    onSuccess: () => {
                      setConfirmando(null);
                      setAviso(`${categoria.nombre} quedó dada de baja.`);
                    },
                  })
                }
              />
            )}
          </li>
        ))}
      </ul>

      {editando && (
        <Modal
          titulo={editando === 'nueva' ? 'Nueva categoría' : `Editar ${editando.nombre}`}
          ancho="max-w-lg"
          alCerrar={() => setEditando(null)}
        >
          <FormularioCategoria
            inicial={editando === 'nueva' ? null : editando}
            organismos={organismos.data?.organismos ?? []}
            guardando={guardar.isPending}
            error={guardar.error}
            alCancelar={() => setEditando(null)}
            alGuardar={(datos, alFallar) =>
              guardar.mutate(
                { id: editando === 'nueva' ? null : editando.id, datos },
                {
                  onSuccess: ({ prioridadesRecalculadas }) => {
                    setEditando(null);
                    setAviso(
                      editando === 'nueva'
                        ? `${datos.nombre} dada de alta.`
                        : prioridadesRecalculadas > 0
                          ? `Cambios guardados. Se recalculó la prioridad de ${prioridadesRecalculadas} incidente(s).`
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

function aDatos(categoria: CategoriaAdmin): DatosCategoria {
  return {
    nombre: categoria.nombre,
    descripcion: categoria.descripcion,
    areaId: categoria.area.id,
    tipoVigenciaDefault: categoria.tipoVigenciaDefault,
    diasCaducidadDefault: categoria.diasCaducidadDefault,
    pesoSeveridadBase: categoria.pesoSeveridadBase,
  };
}

type Errores = Partial<Record<'nombre' | 'descripcion' | 'area' | 'dias' | 'peso', string>>;
const CAMPOS_API: Record<string, keyof Errores> = {
  nombre: 'nombre',
  descripcion: 'descripcion',
  areaId: 'area',
  diasCaducidadDefault: 'dias',
  pesoSeveridadBase: 'peso',
};

function FormularioCategoria({
  inicial,
  organismos,
  guardando,
  error,
  alCancelar,
  alGuardar,
}: {
  inicial: CategoriaAdmin | null;
  organismos: Organismo[];
  guardando: boolean;
  error: unknown;
  alCancelar: () => void;
  alGuardar: (datos: DatosCategoria, alFallar: (error: unknown) => void) => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [areaId, setAreaId] = useState(inicial ? String(inicial.area.id) : '');
  const [vigencia, setVigencia] = useState<TipoVigencia>(inicial?.tipoVigenciaDefault ?? 'PERMANENTE');
  const [dias, setDias] = useState(inicial?.diasCaducidadDefault ? String(inicial.diasCaducidadDefault) : '');
  const [peso, setPeso] = useState(inicial ? String(inicial.pesoSeveridadBase) : '1');
  const [errores, setErrores] = useState<Errores>({});
  const [avisoGeneral, setAvisoGeneral] = useState(false);

  // Solo se ofrecen las áreas activas; la actual, si se dio de baja, se muestra igual para no perderla.
  const areaActualInactiva = inicial && !inicial.area.activa ? inicial.area : null;

  // Cada campo se controla al salir de él: el error se ve antes de mandar.
  const validadores: Record<keyof Errores, () => string | undefined> = {
    nombre: () =>
      !nombre.trim() ? 'Es obligatorio' : nombre.trim().length > 80 ? 'Hasta 80 caracteres' : undefined,
    descripcion: () => (descripcion.trim().length > 1000 ? 'Hasta 1000 caracteres' : undefined),
    area: () => (!areaId ? 'Elegí el área que la atiende' : undefined),
    dias: () => {
      if (vigencia === 'PERMANENTE' || !dias.trim()) return undefined;
      const numero = Number(dias);
      return Number.isInteger(numero) && numero >= 1 && numero <= 3650
        ? undefined
        : 'Un número entero de 1 a 3650';
    },
    peso: () => problemaDosDecimales(peso, 99.99) ?? undefined,
  };
  const marcar = (campo: keyof Errores) =>
    setErrores((previos) => ({ ...previos, [campo]: validadores[campo]() }));
  const limpiar = (campo: keyof Errores) => setErrores((previos) => ({ ...previos, [campo]: undefined }));

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validados = Object.fromEntries(
      Object.entries(validadores).map(([campo, validar]) => [campo, validar()]),
    ) as Errores;
    setErrores(validados);
    setAvisoGeneral(false);
    if (Object.values(validados).some(Boolean)) return;
    alGuardar(
      {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        areaId: Number(areaId),
        tipoVigenciaDefault: vigencia,
        diasCaducidadDefault: vigencia === 'TEMPORAL' && dias.trim() ? Number(dias) : null,
        pesoSeveridadBase: Number(peso.trim().replace(',', '.')),
      },
      (fallo) => {
        const { porCampo, sinCampo } = repartirErrores(aErrorApi(fallo), CAMPOS_API);
        setErrores(porCampo);
        setAvisoGeneral(sinCampo);
      },
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Campo
        id="categoria-nombre"
        etiqueta="Nombre"
        autoComplete="off"
        value={nombre}
        onChange={(evento) => {
          setNombre(evento.target.value);
          limpiar('nombre');
        }}
        onBlur={() => marcar('nombre')}
        error={errores.nombre}
      />
      <div className="space-y-1">
        <label htmlFor="categoria-descripcion" className="block text-sm font-semibold text-texto">
          Descripción para el vecino (opcional)
        </label>
        <textarea
          id="categoria-descripcion"
          rows={2}
          value={descripcion}
          onChange={(evento) => {
            setDescripcion(evento.target.value);
            limpiar('descripcion');
          }}
          onBlur={() => marcar('descripcion')}
          className={`w-full rounded-md border bg-superficie px-3 py-2 text-texto focus:outline-none ${
            errores.descripcion ? 'border-peligro' : 'border-borde focus:border-primario'
          }`}
        />
        {errores.descripcion && <p className="text-sm text-peligro">{errores.descripcion}</p>}
      </div>
      <CampoSelecto
        id="categoria-area"
        etiqueta="Área que la atiende"
        value={areaId}
        onChange={(evento) => {
          setAreaId(evento.target.value);
          limpiar('area');
        }}
        error={errores.area}
      >
        <option value="">Elegí un área</option>
        {areaActualInactiva && (
          <option value={areaActualInactiva.id}>{areaActualInactiva.nombre} (dada de baja)</option>
        )}
        {organismos.map((organismo) => (
          <optgroup key={organismo.id} label={organismo.nombre}>
            {organismo.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </optgroup>
        ))}
      </CampoSelecto>
      <CampoSelecto
        id="categoria-vigencia"
        etiqueta="Vigencia"
        value={vigencia}
        onChange={(evento) => {
          setVigencia(evento.target.value as TipoVigencia);
          limpiar('dias');
        }}
      >
        <option value="PERMANENTE">Permanente: sigue hasta que se resuelve</option>
        <option value="TEMPORAL">Temporal: caduca sola</option>
      </CampoSelecto>
      {vigencia === 'TEMPORAL' && (
        <Campo
          id="categoria-dias"
          etiqueta="Días hasta que caduca (vacío: los días por defecto)"
          inputMode="numeric"
          value={dias}
          onChange={(evento) => {
            setDias(evento.target.value);
            limpiar('dias');
          }}
          onBlur={() => marcar('dias')}
          error={errores.dias}
        />
      )}
      <Campo
        id="categoria-peso"
        etiqueta="Peso en la prioridad (1 es lo normal)"
        inputMode="decimal"
        value={peso}
        onChange={(evento) => {
          setPeso(evento.target.value);
          limpiar('peso');
        }}
        onBlur={() => marcar('peso')}
        error={errores.peso}
      />
      {inicial && (
        <p className="text-xs text-texto-secundario">
          Un peso nuevo recalcula enseguida la prioridad de sus incidentes abiertos. Una vigencia nueva vale
          para los incidentes que se creen desde ahora.
        </p>
      )}
      {avisoGeneral && error != null && <AvisoError error={aErrorApi(error)} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={alCancelar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
