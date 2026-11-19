/**
 * A qué área quedó derivado un incidente publicado (`derivadoA` en la ficha y el feed). Mientras está en revisión
 * viene null y no se muestra nada: todavía no se derivó a nadie.
 */
export function DerivadoA({ area }: { area: { nombre: string } | null | undefined }) {
  if (!area) return null;
  return (
    <p className="text-sm text-texto-secundario">
      Derivado al área de <span className="font-semibold text-texto">{area.nombre}</span>
    </p>
  );
}
