import { NavLink, Outlet } from 'react-router-dom';

// Las pantallas de la administración (F16). «Usuarios» es la de entrada: /administracion.
// Perfiles, Matriz y Parámetros no van en el menú: son ajustes técnicos que casi nunca se tocan, y el panel
// queda en lo de todos los días. Sus pantallas siguen andando en /administracion/perfiles, /matriz y
// /parametros; para volver a mostrarlas alcanza con sumarlas acá.
const PESTANAS = [
  { ruta: '/administracion', texto: 'Usuarios', exacta: true },
  { ruta: '/administracion/organismos', texto: 'Organismos y áreas', exacta: false },
  { ruta: '/administracion/categorias', texto: 'Categorías', exacta: false },
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
