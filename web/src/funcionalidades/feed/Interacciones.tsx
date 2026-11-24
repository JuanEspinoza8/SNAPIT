import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { useFocoConfirmacion } from '../../compartido/componentes/useFocoConfirmacion.js';
import { haceCuanto } from '../../compartido/formato/fechas.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';
import type { EstadoIngreso } from '../../compartido/sesion/usuario.js';
import { esVecino } from '../../compartido/sesion/usuario.js';
import { useAccionesSociales, useComentarios, useMeGusta, type Comentable } from './consultas.js';
import { Avatar, NombreAutor } from './piezas.js';
import type { Comentario, ReportePublico } from './tipos.js';

const MAXIMO_COMENTARIO = 1000;

/**
 * Quién puede hacer qué: el vecino da me gusta, comenta y confirma que el problema sigue; el operador y el
 * administrador moderan.
 */
export function usePermisos() {
  const { usuario } = useSesion();
  return {
    conSesion: usuario !== null,
    vecino: usuario !== null && esVecino(usuario),
    modera: usuario !== null && !esVecino(usuario),
  };
}

/** Sin sesión, el me gusta, la caja de comentarios y «Sigue estando» llevan al ingreso; al ingresar se vuelve acá. */
export function useIrAlIngreso() {
  const navegar = useNavigate();
  const { pathname, search } = useLocation();
  const estado: EstadoIngreso = { desde: `${pathname}${search}` };
  return { irAlIngreso: () => void navegar('/ingreso', { state: estado }), estado };
}

/**
 * El corazón con el contador. Lo usa el vecino; el operador y el administrador solo ven el número. Si el servidor
 * lo rechaza, el contador queda como estaba y se dice por qué.
 */
export function BotonMeGusta({ reporte }: { reporte: ReportePublico }) {
  const { conSesion, vecino } = usePermisos();
  const { irAlIngreso } = useIrAlIngreso();
  const meGusta = useMeGusta(reporte.id);
  const dado = reporte.yaMeGusta ?? false;
  const cantidad = reporte.cantidadMeGusta;
  const texto = cantidad === 1 ? '1 me gusta' : `${cantidad} me gusta`;

  if (conSesion && !vecino) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-texto-secundario">
        <span aria-hidden="true">♡</span> {texto}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={dado}
        aria-label={dado ? `Quitar me gusta (${texto})` : `Me gusta (${texto})`}
        disabled={meGusta.isPending}
        onClick={() => (conSesion ? meGusta.mutate(!dado) : irAlIngreso())}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-superficie disabled:opacity-60 ${
          dado ? 'text-peligro' : 'text-texto-secundario'
        }`}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {dado ? '♥' : '♡'}
        </span>
        {cantidad}
      </button>
      {meGusta.isError && (
        <span role="alert" className="text-sm text-peligro">
          {aErrorApi(meGusta.error).mensaje}
        </span>
      )}
    </span>
  );
}

/**
 * Los comentarios de una publicación (la foto de un vecino) o de la ficha de un problema, del más viejo al más
 * nuevo (en una publicación, el de SnapIt queda primero), con la caja para comentar. Cada uno puede editar o
 * eliminar los suyos; el operador y el administrador eliminan cualquiera.
 */
export function SeccionComentarios({ sobre }: { sobre: Comentable }) {
  const comentarios = useComentarios(sobre);
  const { conSesion, vecino } = usePermisos();
  const { estado } = useIrAlIngreso();
  const lista = comentarios.data;

  return (
    <section aria-label="Comentarios" className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{lista ? `Comentarios (${lista.length})` : 'Comentarios'}</h2>
      {comentarios.isPending && (
        <p role="status" className="text-sm text-texto-secundario">
          Cargando los comentarios…
        </p>
      )}
      {comentarios.isError && (
        <AvisoError error={aErrorApi(comentarios.error)} alReintentar={() => void comentarios.refetch()} />
      )}
      {lista?.length === 0 && <p className="text-sm text-texto-secundario">Todavía no hay comentarios.</p>}
      {lista && lista.length > 0 && (
        <ul className="flex flex-col gap-4">
          {lista.map((comentario) => (
            <FilaComentario key={comentario.id} comentario={comentario} sobre={sobre} />
          ))}
        </ul>
      )}
      {vecino && <CajaComentario sobre={sobre} />}
      {!conSesion && (
        <p className="text-sm text-texto-secundario">
          <Link to="/ingreso" state={estado} className="font-semibold text-primario hover:underline">
            Ingresá
          </Link>{' '}
          para comentar.
        </p>
      )}
    </section>
  );
}

function CajaComentario({ sobre }: { sobre: Comentable }) {
  const { comentar } = useAccionesSociales(sobre);
  const id = `comentario-${sobre.tipo}-${sobre.id}`;
  const [texto, setTexto] = useState('');
  const limpio = texto.trim();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!limpio || limpio.length > MAXIMO_COMENTARIO) return;
    comentar.mutate(limpio, { onSuccess: () => setTexto('') });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        Escribí un comentario
      </label>
      <TextoComentario id={id} valor={texto} alCambiar={setTexto} />
      {comentar.isError && <AvisoError error={aErrorApi(comentar.error)} />}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!limpio || limpio.length > MAXIMO_COMENTARIO || comentar.isPending}
          className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {comentar.isPending ? 'Publicando…' : 'Comentar'}
        </button>
      </div>
    </form>
  );
}

/** El campo del comentario, con el contador de caracteres: pasado el máximo no se puede enviar. */
function TextoComentario({
  id,
  valor,
  alCambiar,
}: {
  id: string;
  valor: string;
  alCambiar: (texto: string) => void;
}) {
  const largo = valor.trim().length;
  const pasado = largo > MAXIMO_COMENTARIO;
  return (
    <>
      <textarea
        id={id}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        rows={2}
        placeholder="Escribí un comentario"
        aria-invalid={pasado}
        aria-describedby={`${id}-largo`}
        className="w-full resize-y rounded-md border border-borde bg-superficie px-3 py-2 text-sm"
      />
      <p
        id={`${id}-largo`}
        className={`text-right text-xs ${pasado ? 'text-peligro' : 'text-texto-secundario'}`}
      >
        {largo}/{MAXIMO_COMENTARIO}
      </p>
    </>
  );
}

type Modo = 'ver' | 'editar' | 'confirmarEliminar';

function FilaComentario({ comentario, sobre }: { comentario: Comentario; sobre: Comentable }) {
  const { modera } = usePermisos();
  const { editar, eliminar } = useAccionesSociales(sobre);
  const [modo, setModo] = useState<Modo>('ver');
  const { botonAbrir, botonConfirmar } = useFocoConfirmacion(modo === 'confirmarEliminar');
  const [texto, setTexto] = useState(comentario.texto);
  const propio = comentario.esMio ?? false;
  const limpio = texto.trim();
  const boton = 'rounded-md px-2 py-1 text-xs font-semibold hover:bg-superficie';

  function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!limpio || limpio.length > MAXIMO_COMENTARIO) return;
    editar.mutate({ id: comentario.id, texto: limpio }, { onSuccess: () => setModo('ver') });
  }

  return (
    <li className="flex gap-3">
      <Avatar autor={comentario.autor} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <NombreAutor autor={comentario.autor} />{' '}
          <span className="text-xs text-texto-secundario">
            {haceCuanto(comentario.creadoEn)}
            {comentario.editadoEn && ' · editado'}
          </span>
        </p>

        {modo === 'editar' ? (
          <form onSubmit={guardar} className="mt-1 flex flex-col gap-2">
            <label htmlFor={`editar-${comentario.id}`} className="sr-only">
              Editar el comentario
            </label>
            <TextoComentario id={`editar-${comentario.id}`} valor={texto} alCambiar={setTexto} />
            {editar.isError && <AvisoError error={aErrorApi(editar.error)} />}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTexto(comentario.texto);
                  setModo('ver');
                }}
                className={`${boton} text-texto-secundario`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!limpio || limpio.length > MAXIMO_COMENTARIO || editar.isPending}
                className="rounded-md bg-primario px-3 py-1 text-xs font-semibold text-sobre-primario disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </form>
        ) : (
          <p className="break-words">{comentario.texto}</p>
        )}

        {modo === 'confirmarEliminar' && (
          <div
            role="alertdialog"
            aria-label="Eliminar el comentario"
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            <span className="text-sm">¿Eliminar este comentario?</span>
            <button
              ref={botonConfirmar}
              type="button"
              onClick={() => eliminar.mutate(comentario.id)}
              disabled={eliminar.isPending}
              className="rounded-md bg-peligro px-3 py-1 text-xs font-semibold text-sobre-peligro disabled:opacity-50"
            >
              Sí, eliminar
            </button>
            <button type="button" onClick={() => setModo('ver')} className={`${boton} text-texto-secundario`}>
              No
            </button>
          </div>
        )}
        {eliminar.isError && <AvisoError error={aErrorApi(eliminar.error)} />}

        {modo === 'ver' && (propio || modera) && (
          <div className="mt-1 flex gap-1">
            {propio && (
              <button type="button" onClick={() => setModo('editar')} className={`${boton} text-primario`}>
                Editar
              </button>
            )}
            <button
              ref={botonAbrir}
              type="button"
              onClick={() => setModo('confirmarEliminar')}
              className={`${boton} text-peligro`}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
