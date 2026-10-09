/** Skeleton de una vista que todavía no tiene datos. `filas` son los
 *  renglones grises que se dibujan debajo del título. */
export function Cargando({ filas = 3 }: { filas?: number }) {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true" className="h-8 w-1/3 rounded-md bg-borde" />
      {Array.from({ length: filas }, (_, indice) => (
        <div key={indice} aria-hidden="true" className="h-4 w-2/3 rounded-md bg-borde" />
      ))}
    </div>
  );
}
