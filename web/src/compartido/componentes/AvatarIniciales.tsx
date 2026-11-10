/** Las iniciales de un nombre: de la primera y la última palabra. «Ana Vecina» → «AV», «Ana» → «A». */
export function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  const primera = palabras[0]!.charAt(0);
  const ultima = palabras.length > 1 ? palabras.at(-1)!.charAt(0) : '';
  return (primera + ultima).toUpperCase();
}

/** La foto del perfil: por ahora, las iniciales del nombre en un círculo (no hay foto en el modelo). */
export function AvatarIniciales({ nombre }: { nombre: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primario text-2xl font-semibold text-sobre-primario"
    >
      {iniciales(nombre)}
    </span>
  );
}
