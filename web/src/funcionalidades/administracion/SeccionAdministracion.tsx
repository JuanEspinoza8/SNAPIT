import { NavLink, Outlet } from 'react-router-dom';

// Las pantallas de la administración (F16). «Usuarios» es la de entrada: /administracion.
const PESTANAS = [
  { ruta: '/administracion', texto: 'Usuarios', exacta: true },
  { ruta: '/administracion/organismos', texto: 'Organismos y áreas', exacta: false },
  { ruta: '/administracion/categorias', texto: 'Categorías', exacta: false },
  { ruta: '/administracion/perfiles', texto: 'Perfiles', exacta: false },
  { ruta: '/administracion/matriz', texto: 'Matriz', exacta: false },
  { ruta: '/administracion/parametros', texto: 'Parámetros', exacta: false },
];

/** Las pestañas de la administración, arriba de cada pantalla. */
export function SeccionAdministracion() {
  return (
    <div className="space-y-6">
      <nav aria-label="Administración" className="flex gap-1 overflow-x-auto border-b border-borde">
        {PESTANAS.map((pestana) => (
          <NavLink
            key={pestana.ruta}
            to={pestana.ruta}
            end={pestana.exacta}
            className={({ isActive }) =>
              `-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-primario font-semibold text-texto'
                  : 'border-transparent text-texto-secundario hover:text-texto'
              }`
            }
          >
            {pestana.texto}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
