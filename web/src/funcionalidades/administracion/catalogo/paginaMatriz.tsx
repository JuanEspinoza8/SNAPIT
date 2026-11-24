import { useState } from 'react';
import { AvisoError } from '../../../compartido/componentes/AvisoError.js';
import { Cargando } from '../../../compartido/componentes/Cargando.js';
import { aErrorApi } from '../../../compartido/red/error.js';
import type { CambioCelda } from '../../../compartido/red/repositorioCatalogoAdmin.js';
import { BOTON_SECUNDARIO, MarcaBaja } from '../piezasAdmin.js';
import type { CeldaMatriz } from './tipos.js';
import { useCategoriasAdmin } from './useCatalogoAdmin.js';
import { problemaCelda } from './validaciones.js';

const clave = (categoriaId: number, perfilId: number) => `${categoriaId}-${perfilId}`;
const comoTexto = (celda: CeldaMatriz) =>
  celda.intransitable ? 'intransitable' : String(celda.factorPenalizacion);

/** Si lo escrito dice lo mismo que la celda: «1.0» y «1» son iguales. */
function mismoValor(texto: string, celda: CeldaMatriz) {
  const valor = texto.trim();
  if (valor === 'intransitable' || celda.intransitable) return valor === comoTexto(celda);
  return Number(valor.replace(',', '.')) === celda.factorPenalizacion;
}

/**
 * La matriz categoría × perfil (F11, F16): cuánto le estorba al recorrido de cada perfil un incidente de cada
 * categoría. Cada celda es un número que multiplica el costo del tramo (1 no lo cambia) o «intransitable». Se
 * editan varias y se guardan juntas; las inválidas quedan marcadas y no dejan guardar.
 */
export function PaginaMatriz() {
  const { categorias, guardarMatriz } = useCategoriasAdmin();
  const [editadas, setEditadas] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  const filas = categorias.data?.categorias ?? [];
  // Todas las categorías tienen una fila para cada perfil, en el mismo orden (por nombre).
  const perfiles = filas[0]?.perfiles ?? [];

  const cambios = new Map<number, CambioCelda[]>();
  const invalidas = new Map<string, string>();
  for (const categoria of filas) {
    for (const celda of categoria.perfiles) {
      const texto = editadas[clave(categoria.id, celda.perfilMovilidadId)];
      if (texto === undefined || mismoValor(texto, celda)) continue;
      const problema = problemaCelda(texto);
      if (problema) {
        invalidas.set(clave(categoria.id, celda.perfilMovilidadId), problema);
        continue;
      }
      const intransitable = texto.trim() === 'intransitable';
      const lista = cambios.get(categoria.id) ?? [];
      lista.push({
        perfilMovilidadId: celda.perfilMovilidadId,
        intransitable,
        // Intransitable no usa el factor: se deja el que tenía, para no perderlo si se vuelve atrás.
        factorPenalizacion: intransitable ? celda.factorPenalizacion : Number(texto.trim().replace(',', '.')),
      });
      cambios.set(categoria.id, lista);
    }
  }
  const cantidad = [...cambios.values()].reduce((total, lista) => total + lista.length, 0);

  function guardar() {
    setGuardado(false);
    guardarMatriz.mutate(cambios, {
      onSuccess: () => {
        setEditadas({});
        setGuardado(true);
      },
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Matriz categoría × perfil</h1>
        <p className="text-texto-secundario">
          Cuánto le estorba a cada perfil un incidente de cada categoría en el recorrido accesible: un número
          que multiplica el costo del tramo (1 no lo cambia, 2 lo duplica) o «intransitable» para que lo
          evite.
        </p>
      </div>

      {categorias.isError && (
        <AvisoError
          error={aErrorApi(categorias.error)}
          alReintentar={() => void categorias.refetch()}
          reintentando={categorias.isFetching}
        />
      )}
      {categorias.isPending && <Cargando filas={5} />}

      {filas.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="tabla min-w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 p-2 text-left font-semibold">
                    Categoría
                  </th>
                  {perfiles.map((perfil) => (
                    <th key={perfil.perfilMovilidadId} scope="col" className="p-2 text-left font-semibold">
                      {perfil.nombre}
                      {!perfil.activo && <MarcaBaja texto="Dado de baja" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((categoria) => (
                  <tr key={categoria.id} className={categoria.activa ? '' : 'text-texto-secundario'}>
                    <th scope="row" className="sticky left-0 p-2 text-left font-normal">
                      {categoria.nombre}
                      {!categoria.activa && <MarcaBaja texto="Dada de baja" />}
                    </th>
                    {categoria.perfiles.map((celda) => {
                      const id = clave(categoria.id, celda.perfilMovilidadId);
                      const problema = invalidas.get(id);
                      const editada = editadas[id] !== undefined && !mismoValor(editadas[id]!, celda);
                      return (
                        <td key={id} className="p-1">
                          <input
                            aria-label={`${categoria.nombre} para ${celda.nombre}`}
                            list="valores-celda"
                            value={editadas[id] ?? comoTexto(celda)}
                            aria-invalid={problema ? true : undefined}
                            title={problema}
                            onChange={(evento) => {
                              setEditadas((previas) => ({ ...previas, [id]: evento.target.value }));
                              setGuardado(false);
                            }}
                            className={`w-28 rounded-md border px-2 py-1 text-texto focus:outline-none ${
                              problema
                                ? 'border-peligro'
                                : editada
                                  ? 'border-primario bg-superficie-alterna'
                                  : 'border-borde bg-superficie focus:border-primario'
                            }`}
                          />
                          {problema && <p className="text-xs text-peligro">{problema}</p>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <datalist id="valores-celda">
            <option value="intransitable" />
            <option value="1" />
          </datalist>

          {guardarMatriz.isError && <AvisoError error={aErrorApi(guardarMatriz.error)} />}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {guardado && (
              <p role="status" className="text-sm text-primario">
                Cambios guardados.
              </p>
            )}
            {invalidas.size > 0 && (
              <p className="text-sm text-peligro">Hay {invalidas.size} celda(s) con un valor inválido.</p>
            )}
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={Object.keys(editadas).length === 0}
              onClick={() => setEditadas({})}
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={cantidad === 0 || invalidas.size > 0 || guardarMatriz.isPending}
              onClick={guardar}
              className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
            >
              {guardarMatriz.isPending
                ? 'Guardando…'
                : `Guardar cambios${cantidad > 0 ? ` (${cantidad})` : ''}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
