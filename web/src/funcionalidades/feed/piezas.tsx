import { useRef, useState } from 'react';
import avatarSnapit from '../../assets/avatar-snapit.png';
import { apiUrl } from '../../config/entorno.js';
import type { Autor, Foto, Gravedad } from './tipos.js';

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

/**
 * El círculo con el número del vecino, que hace de foto de perfil. El de SnapIt es su logo (avatar-snapit.png:
 * el de logo-mini.png, cuadrado para que entre entero en el círculo).
 */
export function Avatar({ autor, chico = false }: { autor: Autor; chico?: boolean }) {
  const tamanio = chico ? 'h-6 w-6' : 'h-9 w-9';
  if (autor.sistema) {
    return <img src={avatarSnapit} alt="" className={`${tamanio} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primario font-semibold text-sobre-primario ${
        chico ? `${tamanio} text-xs` : `${tamanio} text-sm`
      }`}
    >
      {autor.numero}
    </span>
  );
}

/** El nombre de quien comentó. SnapIt lleva una marca de cuenta oficial, para que no se confunda con un vecino. */
export function NombreAutor({ autor }: { autor: Autor }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      {autor.nombre}
      {autor.sistema && (
        <span
          role="img"
          aria-label="cuenta oficial"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primario text-xs leading-none text-sobre-primario"
        >
          ✓
        </span>
      )}
    </span>
  );
}
