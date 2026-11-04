import { useRef, useState } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { haceCuanto } from '../../compartido/formato/fechas.js';
import type { ErrorApi } from '../../compartido/red/error.js';
import { apiUrl } from '../../config/entorno.js';
import type { Autor, Comentario, Foto, Gravedad } from './tipos.js';

/**
 * Como los estados, la gravedad se lee por el texto y las barras, no solo por el color. Las clases son
 * los tokens de tema.css; el texto va blanco en los dos temas.
 */
export const GRAVEDADES: Record<Gravedad, { etiqueta: string; clase: string; barras: number }> = {
  LEVE: { etiqueta: 'Leve', clase: 'bg-gravedad-leve', barras: 1 },
  MODERADA: { etiqueta: 'Moderada', clase: 'bg-gravedad-moderada', barras: 2 },
  GRAVE: { etiqueta: 'Grave', clase: 'bg-gravedad-grave', barras: 3 },
};

/** Tres barras de señal, con tantas llenas como la gravedad: el mismo ícono que en la app. */
function Barras({ llenas }: { llenas: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 fill-current">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={i * 4}
          y={8 - i * 4}
          width="3"
          height={4 + i * 4}
          rx="0.5"
          opacity={i < llenas ? 1 : 0.35}
        />
      ))}
    </svg>
  );
}

export function EtiquetaGravedad({ gravedad }: { gravedad: Gravedad }) {
  const { etiqueta, clase, barras } = GRAVEDADES[gravedad];
  return (
    <span
      className={`${clase} inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-sobre-estado`}
    >
      <Barras llenas={barras} />
      {etiqueta}
    </span>
  );
}

export const urlFoto = (id: number) => `${apiUrl}/fotos/${id}`;

/**
 * Las fotos a todo el ancho, en 4:3, pasándolas con las flechas, el dedo o el teclado. Arriba a la derecha
 * dice cuál se ve. `total` es cuántas tiene el incidente, si son más que las que llegaron.
 */
export function Carrusel({
  fotos,
  descripcion,
  total,
}: {
  fotos: Foto[];
  descripcion: string;
  total?: number;
}) {
  const pista = useRef<HTMLUListElement>(null);
  const [actual, setActual] = useState(0);

  if (fotos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-superficie-alterna text-sm text-texto-secundario">
        Sin fotos para mostrar
      </div>
    );
  }

  const ir = (indice: number) => {
    const destino = Math.max(0, Math.min(fotos.length - 1, indice));
    const ancho = pista.current?.clientWidth ?? 0;
    pista.current?.scrollTo?.({ left: destino * ancho, behavior: 'smooth' });
    setActual(destino);
  };
  const restantes = (total ?? fotos.length) - fotos.length;
  const flecha =
    'absolute top-1/2 -translate-y-1/2 rounded-md bg-velo px-3 py-1 text-lg text-sobre-velo hover:opacity-90 disabled:hidden';

  return (
    <div
      className="relative"
      role="group"
      aria-roledescription="carrusel"
      aria-label={`Fotos de ${descripcion}`}
    >
      <ul
        ref={pista}
        onScroll={(evento) => {
          const { scrollLeft, clientWidth } = evento.currentTarget;
          if (clientWidth > 0) setActual(Math.round(scrollLeft / clientWidth));
        }}
        className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      >
        {fotos.map((foto, indice) => (
          <li key={foto.id} className="h-full w-full shrink-0 snap-center">
            <img
              src={urlFoto(foto.id)}
              alt={`Foto ${indice + 1} de ${fotos.length} de ${descripcion}`}
              loading="lazy"
              className="h-full w-full bg-superficie-alterna object-cover"
            />
          </li>
        ))}
      </ul>
      {fotos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => ir(actual - 1)}
            disabled={actual === 0}
            aria-label="Foto anterior"
            className={`${flecha} left-2`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => ir(actual + 1)}
            disabled={actual === fotos.length - 1}
            aria-label="Foto siguiente"
            className={`${flecha} right-2`}
          >
            ›
          </button>
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 rounded-md bg-velo px-2 py-0.5 text-xs text-sobre-velo"
          >
            {actual + 1}/{fotos.length}
          </span>
        </>
      )}
      {restantes > 0 && actual === fotos.length - 1 && (
        <span className="absolute bottom-2 left-2 rounded-md bg-velo px-2 py-0.5 text-xs text-sobre-velo">
          {restantes === 1 ? '+1 foto en el detalle' : `+${restantes} fotos en el detalle`}
        </span>
      )}
    </div>
  );
}

/** «♡ 7  💬 3», con el texto completo para el lector de pantalla. */
export function Contadores({ meGusta, comentarios }: { meGusta: number; comentarios: number }) {
  const texto = `${meGusta === 1 ? '1 me gusta' : `${meGusta} me gusta`}, ${
    comentarios === 1 ? '1 comentario' : `${comentarios} comentarios`
  }`;
  return (
    <span className="inline-flex items-center gap-4 text-sm font-semibold text-texto-secundario">
      <span className="sr-only">{texto}</span>
      <span aria-hidden="true">♡ {meGusta}</span>
      <span aria-hidden="true">💬 {comentarios}</span>
    </span>
  );
}

/** El círculo con el número del vecino, que hace de foto de perfil. */
export function Avatar({ autor, chico = false }: { autor: Autor; chico?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primario font-semibold text-sobre-primario ${
        chico ? 'h-6 w-6 text-xs' : 'h-9 w-9 text-sm'
      }`}
    >
      {autor.numero}
    </span>
  );
}

interface PropsComentarios {
  titulo: string;
  comentarios: Comentario[] | undefined;
  cargando: boolean;
  error: ErrorApi | null;
  alReintentar: () => void;
}

/** Los comentarios de un reporte o de un incidente. Si no cargan, el resto de la página se ve igual. */
export function SeccionComentarios({ titulo, comentarios, cargando, error, alReintentar }: PropsComentarios) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{comentarios ? `${titulo} (${comentarios.length})` : titulo}</h2>
      {cargando && (
        <p role="status" className="text-sm text-texto-secundario">
          Cargando los comentarios…
        </p>
      )}
      {error && <AvisoError error={error} alReintentar={alReintentar} />}
      {comentarios?.length === 0 && (
        <p className="text-sm text-texto-secundario">Todavía no hay comentarios.</p>
      )}
      {comentarios && comentarios.length > 0 && (
        <ul className="flex flex-col gap-4">
          {comentarios.map((comentario) => (
            <li key={comentario.id} className="flex gap-3">
              <Avatar autor={comentario.autor} />
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{comentario.autor.nombre}</span>{' '}
                  <span className="text-xs text-texto-secundario">
                    {haceCuanto(comentario.creadoEn)}
                    {comentario.editadoEn && ' · editado'}
                  </span>
                </p>
                <p className="break-words">{comentario.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
