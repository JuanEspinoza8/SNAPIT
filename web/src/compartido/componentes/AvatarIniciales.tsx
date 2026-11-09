/** Las iniciales de un nombre: de la primera y la última palabra. «Ana Vecina» → «AV», «Ana» → «A». */
export function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  const primera = palabras[0]!.charAt(0);
  const ultima = palabras.length > 1 ? palabras.at(-1)!.charAt(0) : '';
  return (primera + ultima).toUpperCase();
}

const TAMANOS = {
  chico: 'h-7 w-7 text-xs',
  grande: 'h-20 w-20 text-2xl',
};

/** La foto de perfil: por ahora, las iniciales del nombre en un círculo (no hay foto en el modelo). */
export function AvatarIniciales({
  nombre,
  tamano = 'chico',
}: {
  nombre: string;
  tamano?: keyof typeof TAMANOS;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primario font-semibold text-sobre-primario ${TAMANOS[tamano]}`}
    >
      {iniciales(nombre)}
    </span>
  );
}
