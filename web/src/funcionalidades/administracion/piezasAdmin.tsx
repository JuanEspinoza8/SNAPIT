import { useState } from 'react';
import type { FormEvent } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { useFocoConfirmacion } from '../../compartido/componentes/useFocoConfirmacion.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';

// Piezas que comparten las pantallas de la administración (organismos, categorías, perfiles).

export const BOTON_SECUNDARIO =
  'rounded-md border border-borde px-3 py-1 text-sm font-semibold text-texto hover:bg-superficie-alterna';
export const ENLACE =
  'text-sm font-semibold hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40';

// Para buscar sin importar mayúsculas ni tildes: «via» encuentra «Vía Pública».
export const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Lo dado de baja, marcado en la lista. */
export function MarcaBaja({ texto }: { texto: string }) {
  return (
    <span className="ml-1 rounded-full border border-borde px-2 py-0.5 align-middle text-xs font-normal text-texto-secundario">
      {texto}
    </span>
  );
}

/** La confirmación en línea de una baja, con el error del servidor si la rechaza (por ejemplo, un 409). */
export function ConfirmarBaja({
  pregunta,
  pendiente,
  error,
  alCancelar,
  alConfirmar,
}: {
  pregunta: string;
  pendiente: boolean;
  error: unknown;
  alCancelar: () => void;
  alConfirmar: () => void;
}) {
  const { botonConfirmar } = useFocoConfirmacion(true);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <p className="mr-auto text-peligro">{pregunta}</p>
        <button type="button" onClick={alCancelar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
        <button
          ref={botonConfirmar}
          type="button"
          disabled={pendiente}
          onClick={alConfirmar}
          className="rounded-md bg-peligro px-3 py-1 font-semibold text-sobre-peligro hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? 'Dando de baja…' : 'Sí, dar de baja'}
        </button>
      </div>
      {error != null && <AvisoError error={aErrorApi(error)} />}
    </div>
  );
}

type ErroresFormulario = { nombre: string | null; descripcion: string | null };
const CAMPOS_API: Record<string, keyof ErroresFormulario> = { nombre: 'nombre', descripcion: 'descripcion' };

/** El nombre y la descripción de un organismo, un área o un perfil. Si el servidor rechaza algo, lo cargado queda. */
export function FormularioNombre({
  maximo,
  inicial,
  guardando,
  error,
  alCancelar,
  alGuardar,
}: {
  maximo: number;
  inicial: { nombre: string; descripcion: string | null } | null;
  guardando: boolean;
  error: unknown;
  alCancelar: () => void;
  alGuardar: (
    datos: { nombre: string; descripcion: string | null },
    alFallar: (error: unknown) => void,
  ) => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [errores, setErrores] = useState<ErroresFormulario>({ nombre: null, descripcion: null });
  const [avisoGeneral, setAvisoGeneral] = useState(false);

  function validarNombre(valor: string) {
    const limpio = valor.trim();
    if (!limpio) return 'Es obligatorio';
    if (limpio.length > maximo) return `Tiene que tener hasta ${maximo} caracteres`;
    return null;
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validados = {
      nombre: validarNombre(nombre),
      descripcion: descripcion.trim().length > 1000 ? 'Tiene que tener hasta 1000 caracteres' : null,
    };
    setErrores(validados);
    setAvisoGeneral(false);
    if (validados.nombre || validados.descripcion) return;
    alGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim() || null }, (fallo) => {
      const { porCampo, sinCampo } = repartirErrores(aErrorApi(fallo), CAMPOS_API);
      setErrores({ nombre: null, descripcion: null, ...porCampo });
      setAvisoGeneral(sinCampo);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Campo
        id="nombre-entidad"
        etiqueta="Nombre"
        autoComplete="off"
        value={nombre}
        onChange={(evento) => {
          setNombre(evento.target.value);
          setErrores((previos) => ({ ...previos, nombre: null }));
        }}
        error={errores.nombre}
      />
      <div className="space-y-1">
        <label htmlFor="descripcion-entidad" className="block text-sm font-semibold text-texto">
          Descripción (opcional)
        </label>
        <textarea
          id="descripcion-entidad"
          rows={3}
          value={descripcion}
          onChange={(evento) => {
            setDescripcion(evento.target.value);
            setErrores((previos) => ({ ...previos, descripcion: null }));
          }}
          className={`w-full rounded-md border bg-superficie px-3 py-2 text-texto focus:outline-none ${
            errores.descripcion ? 'border-peligro' : 'border-borde focus:border-primario'
          }`}
        />
        {errores.descripcion && <p className="text-sm text-peligro">{errores.descripcion}</p>}
      </div>
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
