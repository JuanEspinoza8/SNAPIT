export function SeccionEnConstruccion({ titulo }: { titulo: string }) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-texto">{titulo}</h1>
      <p className="text-texto-secundario">Esta sección todavía no tiene contenido.</p>
    </section>
  );
}
