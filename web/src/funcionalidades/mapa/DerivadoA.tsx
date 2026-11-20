/**
 * Qué área atiende un incidente publicado (`derivadoA` en la ficha y el feed). No dice «derivado»: lo deriva
 * después un operador, y hasta entonces el estado sigue siendo «Verificado». Mientras está en revisión viene null
 * y no se muestra nada.
 */
export function DerivadoA({ area }: { area: { nombre: string } | null | undefined }) {
  if (!area) return null;
  return (
    <p className="text-sm text-texto-secundario">
      Le corresponde al área de <span className="font-semibold text-texto">{area.nombre}</span>
    </p>
  );
}
