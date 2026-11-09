import { AvatarIniciales } from '../../compartido/componentes/AvatarIniciales.js';
import { BotonReportar } from '../../compartido/componentes/BotonReportar.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';
import { esVecino, type Rol } from '../../compartido/sesion/usuario.js';
import { ListaMisReportes } from '../misReportes/ListaMisReportes.js';

const ROLES: Record<Rol, string> = {
  VECINO: 'Vecino',
  OPERADOR: 'Operador',
  ADMINISTRADOR: 'Administrador',
};

/**
 * El perfil de quien inició sesión: sus datos y, si es vecino, sus reportes. Solo el propio: en el feed los
 * autores se muestran como «Vecino N», sin nada que los identifique.
 */
export function PaginaPerfil() {
  const { usuario } = useSesion();
  // La ruta está protegida: sin sesión no se llega acá.
  if (!usuario) return null;
  const vecino = esVecino(usuario);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-borde bg-superficie-alterna p-5">
        <AvatarIniciales nombre={usuario.nombre} tamano="grande" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold text-texto">{usuario.nombre}</h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-texto-secundario">Correo</dt>
            <dd className="break-all text-texto">{usuario.email}</dd>
            <dt className="text-texto-secundario">Rol</dt>
            <dd className="text-texto">{ROLES[usuario.rol]}</dd>
          </dl>
        </div>
      </div>

      {vecino ? (
        <section aria-labelledby="titulo-reportes" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-reportes" className="text-lg font-semibold text-texto">
              Mis reportes
            </h2>
            <BotonReportar />
          </div>
          <ListaMisReportes />
        </section>
      ) : (
        <p className="text-sm text-texto-secundario">
          Los reportes los hacen los vecinos: desde tu rol gestionás los de tu organismo.
        </p>
      )}
    </section>
  );
}
