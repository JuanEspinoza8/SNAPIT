import { useState } from 'react';
import { AvatarIniciales } from '../../compartido/componentes/AvatarIniciales.js';
import { BotonReportar } from '../../compartido/componentes/BotonReportar.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';
import { esVecino, type Rol } from '../../compartido/sesion/usuario.js';
import { ListaMisReportes } from '../misReportes/ListaMisReportes.js';
import { useMisReportes } from '../misReportes/useMisReportes.js';
import { EditarPerfil } from './EditarPerfil.js';

const ROLES: Record<Rol, string> = {
  VECINO: 'Vecino',
  OPERADOR: 'Operador',
  ADMINISTRADOR: 'Administrador',
};

const mesYAnio = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Argentina/Buenos_Aires',
});

/**
 * El perfil de quien inició sesión, como en la app: arriba sus datos con «Editar perfil», desde cuándo es
 * miembro y cuántos reportes hizo; abajo, si es vecino, sus reportes. Solo el propio: en el feed los autores se
 * muestran como «Vecino N», sin nada que los identifique.
 */
export function PaginaPerfil() {
  const { usuario } = useSesion();
  const [editando, setEditando] = useState(false);
  // La ruta está protegida: sin sesión no se llega acá.
  if (!usuario) return null;
  const vecino = esVecino(usuario);

  return (
    <section className="flex flex-col gap-6">
      <div className="tarjeta flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarIniciales nombre={usuario.nombre} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="break-words text-2xl font-semibold text-texto">{usuario.nombre}</h1>
            <p className="break-all text-sm text-texto-secundario">{usuario.email}</p>
            <p>
              <span className="rounded-full border border-borde-tarjeta px-2 py-0.5 text-xs font-semibold text-texto">
                {ROLES[usuario.rol]}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="w-full rounded-md border border-borde-tarjeta bg-superficie px-4 py-2 text-sm font-semibold text-texto hover:bg-superficie-alterna sm:w-auto"
          >
            Editar perfil
          </button>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {usuario.creadoEn && (
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true">📅</span>
              <dt className="sr-only">Miembro desde</dt>
              <dd className="text-texto-secundario">
                Miembro desde {mesYAnio.format(new Date(usuario.creadoEn))}
              </dd>
            </div>
          )}
          {vecino && <CantidadReportes />}
        </dl>
      </div>

      {vecino ? (
        <SeccionMisReportes />
      ) : (
        <p className="text-sm text-texto-secundario">
          Los reportes los hacen los vecinos: desde tu rol gestionás los de tu organismo.
        </p>
      )}

      {editando && <EditarPerfil usuario={usuario} alCerrar={() => setEditando(false)} />}
    </section>
  );
}

/** «3 reportes», de la misma consulta que la lista: no hace otro pedido. */
function CantidadReportes() {
  const { data } = useMisReportes();
  if (data === undefined) return null;
  return (
    <div className="flex items-center gap-1.5">
      <dt className="sr-only">Reportes</dt>
      <dd className="text-texto-secundario">
        <span className="font-semibold text-texto">{data.length}</span>{' '}
        {data.length === 1 ? 'reporte' : 'reportes'}
      </dd>
    </div>
  );
}

/** «Mis reportes» dentro del perfil (F02), con una pestaña como en la app. Aparte, para no pedir la lista si el
 *  usuario no es vecino. */
function SeccionMisReportes() {
  const { data } = useMisReportes();
  // Sin reportes, la lista ya ofrece «Reportar un problema»: el botón de arriba lo repetiría.
  const hayReportes = data !== undefined && data.length > 0;

  return (
    <section aria-labelledby="titulo-reportes" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-borde">
        <h2
          id="titulo-reportes"
          className="-mb-px border-b-2 border-primario px-4 pb-2 text-sm font-semibold text-texto"
        >
          Mis reportes
        </h2>
        {hayReportes && (
          <div className="pb-2">
            <BotonReportar />
          </div>
        )}
      </div>
      <ListaMisReportes />
    </section>
  );
}
