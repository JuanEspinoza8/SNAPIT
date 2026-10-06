import { Link } from 'react-router-dom';

export function Inicio() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-texto">SNAPit</h1>
      <p className="text-texto-secundario">Reportes ciudadanos sobre la vía pública.</p>
      <Link
        to="/salud"
        className="inline-block rounded-md bg-primario px-4 py-2 text-sm font-medium text-sobre-primario"
      >
        Ver estado del servidor
      </Link>
    </section>
  );
}
