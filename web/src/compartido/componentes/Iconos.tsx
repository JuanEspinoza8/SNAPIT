/**
 * Íconos chicos de trazo, dibujados a mano para no sumar una librería: toman el color del texto (currentColor) y
 * van siempre junto a un texto, así que se ocultan al lector de pantalla.
 */
interface Props {
  className?: string;
}

function Icono({ className = 'h-4 w-4', children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/** Un pin de mapa: dónde está el problema. */
export function IconoUbicacion(props: Props) {
  return (
    <Icono {...props}>
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Icono>
  );
}

/** Un globo de diálogo: los comentarios. */
export function IconoComentario(props: Props) {
  return (
    <Icono {...props}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />
    </Icono>
  );
}

/** Un edificio: el área del municipio que lo atiende. */
export function IconoArea(props: Props) {
  return (
    <Icono {...props}>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11" />
      <path d="M3 21h18M8 8h3M8 12h3M8 16h3" />
    </Icono>
  );
}

/** Dos personas: cuántos vecinos lo reportaron. */
export function IconoVecinos(props: Props) {
  return (
    <Icono {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Icono>
  );
}
