import { useState, type ReactNode } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import type { Categoria } from '../../compartido/catalogo/categorias.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { Modal } from '../revision/Modal.js';
import { numero } from './formato.js';
import type { FichaGestion, Referencia } from './tipos.js';
import type { useAccionesFicha } from './useGestion.js';

type Acciones = ReturnType<typeof useAccionesFicha>;

interface PropsDialogo<M> {
  ficha: FichaGestion;
  mutacion: M;
  alTerminar: () => void;
  alCerrar: () => void;
}

const MAX_TEXTO = 1000;
const MAX_PRIORIDAD = 9999.99;

export function DialogoDerivar({
  ficha,
  areas,
  mutacion,
  alTerminar,
  alCerrar,
}: PropsDialogo<Acciones['derivar']> & { areas: Referencia[] }) {
  // Derivado ya está en su área: re-derivar es elegir otra. Verificado todavía no se derivó a ninguna.
  const opciones = areas.filter((area) => ficha.estado !== 'DERIVADO' || area.id !== ficha.area.id);
  const [areaId, setAreaId] = useState('');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const nombre = opciones.find((area) => String(area.id) === areaId)?.nombre;

  const validar = () => {
    const mensaje = areaId ? null : 'Elegí un área';
    setError(mensaje);
    return mensaje === null;
  };
  const enviar = () => mutacion.mutate({ areaId: Number(areaId), comentario }, { onSuccess: alTerminar });

  return (
    <Modal titulo={`Derivar el incidente #${ficha.id}`} ancho="max-w-md" alCerrar={alCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-secundario">
          {ficha.estado === 'DERIVADO'
            ? `Hoy está derivado a ${ficha.area.nombre}. Podés pasarlo a otra área del organismo.`
            : `Por su categoría le corresponde a ${ficha.area.nombre}. Elegí el área que lo va a atender.`}
        </p>
        <CampoSelecto
          id="derivar-area"
          etiqueta="Área"
          value={areaId}
          disabled={confirmando}
          error={error}
          onChange={(evento) => {
            setAreaId(evento.target.value);
            setError(null);
          }}
          onBlur={validar}
        >
          <option value="">Elegí un área</option>
          {opciones.map((area) => (
            <option key={area.id} value={area.id}>
              {area.nombre}
            </option>
          ))}
        </CampoSelecto>
        <CampoTexto
          id="derivar-comentario"
          etiqueta="Comentario (opcional)"
          valor={comentario}
          deshabilitado={confirmando}
          alCambiar={setComentario}
        />
        <ErrorDelServidor error={mutacion.error} />
        {confirmando ? (
          <Confirmacion
            pregunta={`¿Derivar a ${nombre}? El incidente deja de estar verificado y no vuelve a ese estado.`}
            texto="Sí, derivar"
            enviando={mutacion.isPending}
            alConfirmar={enviar}
            alCancelar={() => setConfirmando(false)}
          />
        ) : (
          <BotonEnviar
            texto="Derivar"
            enviando={mutacion.isPending}
            alEnviar={() => {
              if (!validar()) return;
              // Re-derivar no pide confirmación: si se eligió mal, se deriva otra vez.
              if (ficha.estado === 'VERIFICADO') setConfirmando(true);
              else enviar();
            }}
          />
        )}
      </div>
    </Modal>
  );
}

export function DialogoEstado({
  ficha,
  estado,
  mutacion,
  alTerminar,
  alCerrar,
}: PropsDialogo<Acciones['cambiarEstado']> & { estado: 'EN_EJECUCION' | 'DESESTIMADO' }) {
  const desestimar = estado === 'DESESTIMADO';
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // El motivo es obligatorio solo para desestimar.
  const validar = () => {
    const mensaje = desestimar && !comentario.trim() ? 'Escribí el motivo' : null;
    setError(mensaje);
    return mensaje === null;
  };

  return (
    <Modal
      titulo={
        desestimar ? `Desestimar el incidente #${ficha.id}` : `Pasar a ejecución el incidente #${ficha.id}`
      }
      ancho="max-w-md"
      alCerrar={alCerrar}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-secundario">
          {desestimar
            ? 'Sale del mapa y de la bandeja. Sus reportes y la reputación de los vecinos no cambian.'
            : `${ficha.area.nombre} empezó a trabajar en el problema.`}
        </p>
        <CampoTexto
          id="estado-comentario"
          etiqueta={desestimar ? 'Motivo' : 'Comentario (opcional)'}
          valor={comentario}
          error={error}
          deshabilitado={confirmando}
          alCambiar={(texto) => {
            setComentario(texto);
            setError(null);
          }}
          alSalir={desestimar ? validar : undefined}
        />
        <ErrorDelServidor error={mutacion.error} />
        {confirmando ? (
          <Confirmacion
            pregunta={
              desestimar
                ? '¿Desestimar el incidente? Es definitivo: no se puede volver a abrir.'
                : '¿Pasar a ejecución? No vuelve a quedar solo derivado.'
            }
            texto={desestimar ? 'Sí, desestimar' : 'Sí, pasar a ejecución'}
            peligrosa={desestimar}
            enviando={mutacion.isPending}
            alConfirmar={() => mutacion.mutate({ estado, comentario }, { onSuccess: alTerminar })}
            alCancelar={() => setConfirmando(false)}
          />
        ) : (
          <BotonEnviar
            texto={desestimar ? 'Desestimar' : 'Pasar a ejecución'}
            enviando={mutacion.isPending}
            alEnviar={() => {
              if (validar()) setConfirmando(true);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

export function DialogoCategoria({
  ficha,
  categorias,
  mutacion,
  alTerminar,
  alCerrar,
}: PropsDialogo<Acciones['cambiarCategoria']> & { categorias: Categoria[] }) {
  const opciones = categorias.filter((categoria) => categoria.id !== ficha.categoria.id);
  const [categoriaId, setCategoriaId] = useState('');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Mientras no se derivó, el área sale de la categoría.
  const sinDerivar = ficha.estado === 'REGISTRADO' || ficha.estado === 'VERIFICADO';

  const validar = () => {
    const mensaje = categoriaId ? null : 'Elegí una categoría';
    setError(mensaje);
    return mensaje === null;
  };

  return (
    <Modal titulo={`Cambiar la categoría del incidente #${ficha.id}`} ancho="max-w-md" alCerrar={alCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-secundario">
          Hoy es «{ficha.categoria.nombre}». La categoría que eligió cada vecino en su reporte no cambia
          {sinDerivar ? ', y el incidente pasa al área de la categoría nueva.' : '.'}
        </p>
        <CampoSelecto
          id="categoria-nueva"
          etiqueta="Categoría nueva"
          value={categoriaId}
          error={error}
          onChange={(evento) => {
            setCategoriaId(evento.target.value);
            setError(null);
          }}
          onBlur={validar}
        >
          <option value="">Elegí una categoría</option>
          {opciones.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre} ({categoria.area.nombre})
            </option>
          ))}
        </CampoSelecto>
        <CampoTexto
          id="categoria-comentario"
          etiqueta="Comentario (opcional)"
          valor={comentario}
          alCambiar={setComentario}
        />
        <ErrorDelServidor error={mutacion.error} />
        <BotonEnviar
          texto="Cambiar la categoría"
          enviando={mutacion.isPending}
          alEnviar={() => {
            if (validar()) {
              mutacion.mutate({ categoriaId: Number(categoriaId), comentario }, { onSuccess: alTerminar });
            }
          }}
        />
      </div>
    </Modal>
  );
}

export function DialogoPrioridad({
  ficha,
  mutacion,
  alTerminar,
  alCerrar,
}: PropsDialogo<Acciones['fijarPrioridad']>) {
  const { prioridadManual, puntajePrioridad } = ficha.prioridad;
  const [valor, setValor] = useState(prioridadManual === null ? '' : String(prioridadManual));
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<{ valor?: string | null; motivo?: string | null }>({});

  const errorValor = () => {
    const cantidad = Number(valor);
    if (valor.trim() === '' || !Number.isFinite(cantidad)) return 'Escribí un número';
    if (cantidad < 0 || cantidad > MAX_PRIORIDAD) {
      return `Tiene que estar entre 0 y ${numero.format(MAX_PRIORIDAD)}`;
    }
    return null;
  };
  const errorMotivo = () => (motivo.trim() ? null : 'Escribí el motivo');

  function enviar() {
    const nuevos = { valor: errorValor(), motivo: errorMotivo() };
    setErrores(nuevos);
    if (nuevos.valor || nuevos.motivo) return;
    mutacion.mutate({ valor: Number(valor), motivo }, { onSuccess: alTerminar });
  }

  return (
    <Modal titulo={`Prioridad del incidente #${ficha.id}`} ancho="max-w-md" alCerrar={alCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-secundario">
          La calculada es {numero.format(puntajePrioridad)}. La que fijes manda en el orden de la bandeja
          hasta que se quite el ajuste.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="prioridad-valor" className="text-sm font-semibold text-texto">
            Prioridad
          </label>
          <input
            id="prioridad-valor"
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_PRIORIDAD}
            step={0.01}
            value={valor}
            onChange={(evento) => {
              setValor(evento.target.value);
              setErrores((previos) => ({ ...previos, valor: null }));
            }}
            onBlur={() => setErrores((previos) => ({ ...previos, valor: errorValor() }))}
            className={`w-full rounded-md border bg-superficie px-3 py-2 text-texto focus:outline-none ${
              errores.valor ? 'border-peligro' : 'border-borde focus:border-primario'
            }`}
          />
          {errores.valor && <p className="text-sm text-peligro">{errores.valor}</p>}
        </div>
        <CampoTexto
          id="prioridad-motivo"
          etiqueta="Motivo"
          valor={motivo}
          error={errores.motivo}
          alCambiar={(texto) => {
            setMotivo(texto);
            setErrores((previos) => ({ ...previos, motivo: null }));
          }}
          alSalir={() => setErrores((previos) => ({ ...previos, motivo: errorMotivo() }))}
        />
        <ErrorDelServidor error={mutacion.error} />
        <BotonEnviar texto="Guardar la prioridad" enviando={mutacion.isPending} alEnviar={enviar} />
      </div>
    </Modal>
  );
}

/** Un botón de la barra de acciones de la ficha. */
export function BotonAccion({
  children,
  peligrosa = false,
  alElegir,
}: {
  children: ReactNode;
  peligrosa?: boolean;
  alElegir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={alElegir}
      className={`rounded-md border px-3 py-2 text-sm font-semibold hover:bg-superficie-alterna ${
        peligrosa ? 'border-peligro text-peligro' : 'border-borde text-primario'
      }`}
    >
      {children}
    </button>
  );
}

function CampoTexto(props: {
  id: string;
  etiqueta: string;
  valor: string;
  error?: string | null;
  deshabilitado?: boolean;
  alCambiar: (texto: string) => void;
  alSalir?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-semibold text-texto">
        {props.etiqueta}
      </label>
      <textarea
        id={props.id}
        rows={3}
        maxLength={MAX_TEXTO}
        value={props.valor}
        disabled={props.deshabilitado}
        onChange={(evento) => props.alCambiar(evento.target.value)}
        onBlur={props.alSalir}
        className={`w-full rounded-md border bg-superficie px-3 py-2 text-sm text-texto focus:outline-none disabled:opacity-60 ${
          props.error ? 'border-peligro' : 'border-borde focus:border-primario'
        }`}
      />
      {props.error && <p className="text-sm text-peligro">{props.error}</p>}
    </div>
  );
}

function ErrorDelServidor({ error }: { error: unknown }) {
  return error ? <AvisoError error={aErrorApi(error)} /> : null;
}

function BotonEnviar({
  texto,
  enviando,
  alEnviar,
}: {
  texto: string;
  enviando: boolean;
  alEnviar: () => void;
}) {
  return (
    <button
      type="button"
      disabled={enviando}
      onClick={alEnviar}
      className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
    >
      {enviando ? 'Guardando…' : texto}
    </button>
  );
}

/** El segundo paso de una acción que no se puede deshacer (criterio de la #68). */
function Confirmacion(props: {
  pregunta: string;
  texto: string;
  peligrosa?: boolean;
  enviando: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Confirmar"
      className="flex flex-col gap-2 rounded-md border border-peligro bg-superficie-alterna p-3"
    >
      <p className="text-sm font-semibold text-texto">{props.pregunta}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={props.enviando}
          onClick={props.alCancelar}
          className="rounded-md border border-borde px-4 py-2 text-sm font-semibold text-texto hover:bg-superficie disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={props.enviando}
          onClick={props.alConfirmar}
          className={`rounded-md px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50 ${
            props.peligrosa ? 'bg-peligro' : 'bg-primario'
          }`}
        >
          {props.enviando ? 'Guardando…' : props.texto}
        </button>
      </div>
    </div>
  );
}
